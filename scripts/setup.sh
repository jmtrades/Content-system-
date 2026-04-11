#!/usr/bin/env bash
# ============================================================================
# Content Empire - One-Time Setup Script
# ============================================================================
# Usage:
#   chmod +x scripts/setup.sh
#   ./scripts/setup.sh
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }
step()    { echo -e "\n${CYAN}==> $*${NC}"; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
step "Checking operating system"
if [[ "$(uname)" == "Darwin" ]]; then
  OS="macos"
  info "Detected macOS"
elif [[ "$(uname)" == "Linux" ]]; then
  OS="linux"
  info "Detected Linux"
else
  error "Unsupported OS: $(uname)"
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. System dependencies
# ---------------------------------------------------------------------------
step "Checking system dependencies"

check_command() {
  local cmd="$1"
  local install_hint="$2"
  if command -v "$cmd" &>/dev/null; then
    success "$cmd is installed ($(command -v "$cmd"))"
    return 0
  else
    warn "$cmd is not installed"
    echo "       $install_hint"
    return 1
  fi
}

MISSING=0

# ffmpeg
if ! check_command ffmpeg "Install: sudo apt install ffmpeg (Linux) or brew install ffmpeg (macOS)"; then
  if [[ "$OS" == "linux" ]]; then
    info "Attempting to install ffmpeg via apt..."
    if sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg; then
      success "ffmpeg installed successfully"
    else
      error "Failed to install ffmpeg. Please install manually."
      MISSING=1
    fi
  elif [[ "$OS" == "macos" ]]; then
    if command -v brew &>/dev/null; then
      info "Attempting to install ffmpeg via Homebrew..."
      if brew install ffmpeg; then
        success "ffmpeg installed successfully"
      else
        error "Failed to install ffmpeg via Homebrew."
        MISSING=1
      fi
    else
      error "Homebrew not found. Install ffmpeg manually: brew install ffmpeg"
      MISSING=1
    fi
  fi
fi

# python3 and pip
if ! check_command python3 "Install: sudo apt install python3 python3-pip (Linux) or brew install python3 (macOS)"; then
  if [[ "$OS" == "linux" ]]; then
    info "Attempting to install python3 and pip..."
    if sudo apt-get update -qq && sudo apt-get install -y -qq python3 python3-pip python3-venv; then
      success "python3 and pip installed successfully"
    else
      error "Failed to install python3. Please install manually."
      MISSING=1
    fi
  else
    error "Please install python3 manually."
    MISSING=1
  fi
else
  # Ensure pip is available
  if ! python3 -m pip --version &>/dev/null; then
    warn "pip not found for python3"
    if [[ "$OS" == "linux" ]]; then
      info "Attempting to install python3-pip..."
      if sudo apt-get install -y -qq python3-pip python3-venv 2>/dev/null; then
        success "python3-pip installed"
      else
        error "Failed to install pip. Please install python3-pip manually."
        MISSING=1
      fi
    else
      error "Please install pip: python3 -m ensurepip --upgrade"
      MISSING=1
    fi
  else
    success "pip is available"
  fi
fi

# Node.js
if ! check_command node "Install: https://nodejs.org or use nvm"; then
  error "Node.js is required. Install from https://nodejs.org or via nvm."
  MISSING=1
fi

if [[ "$MISSING" -eq 1 ]]; then
  error "Some dependencies could not be installed. Fix the issues above and re-run this script."
  exit 1
fi

success "All system dependencies are present"

# ---------------------------------------------------------------------------
# 2. Install Ollama
# ---------------------------------------------------------------------------
step "Setting up Ollama (local LLM inference)"

if command -v ollama &>/dev/null; then
  success "Ollama is already installed ($(ollama --version 2>/dev/null || echo 'version unknown'))"
else
  info "Installing Ollama..."
  if curl -fsSL https://ollama.com/install.sh | sh; then
    success "Ollama installed successfully"
  else
    error "Failed to install Ollama. Visit https://ollama.com for manual installation."
    exit 1
  fi
fi

# Start Ollama in the background if not already running
if ! curl -s http://localhost:11434/api/tags &>/dev/null; then
  info "Starting Ollama server in the background..."
  ollama serve &>/dev/null &
  OLLAMA_PID=$!
  # Wait for Ollama to be ready
  for i in {1..30}; do
    if curl -s http://localhost:11434/api/tags &>/dev/null; then
      success "Ollama server is running"
      break
    fi
    if [[ $i -eq 30 ]]; then
      warn "Ollama server did not start within 30 seconds. Models will be pulled when Ollama is available."
    fi
    sleep 1
  done
else
  success "Ollama server is already running"
fi

# Pull models
pull_model() {
  local model="$1"
  info "Pulling model: $model (this may take a while on first run)..."
  if ollama pull "$model"; then
    success "Model $model is ready"
  else
    warn "Failed to pull $model. You can retry later with: ollama pull $model"
  fi
}

if curl -s http://localhost:11434/api/tags &>/dev/null; then
  pull_model "mistral"
  pull_model "llama3:8b"
else
  warn "Ollama server not reachable. Skipping model pulls."
  warn "Start Ollama and run: ollama pull mistral && ollama pull llama3:8b"
fi

# ---------------------------------------------------------------------------
# 3. Install Faster-Whisper (Python)
# ---------------------------------------------------------------------------
step "Installing Faster-Whisper for caption generation"

if python3 -c "import faster_whisper" &>/dev/null; then
  success "faster-whisper is already installed"
else
  info "Installing faster-whisper via pip..."
  if python3 -m pip install --user faster-whisper 2>/dev/null || python3 -m pip install faster-whisper; then
    success "faster-whisper installed successfully"
  else
    error "Failed to install faster-whisper."
    error "Try manually: python3 -m pip install faster-whisper"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# 4. Install Node.js dependencies
# ---------------------------------------------------------------------------
step "Installing Node.js dependencies"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

if [[ -f "package.json" ]]; then
  info "Running npm install..."
  if npm install; then
    success "Node.js dependencies installed"
  else
    error "npm install failed. Check package.json for issues."
    exit 1
  fi
else
  error "package.json not found in $PROJECT_ROOT"
  exit 1
fi

# ---------------------------------------------------------------------------
# 5. Create content directories
# ---------------------------------------------------------------------------
step "Creating content directories"

CONTENT_DIRS=(
  "content/raw"
  "content/processed"
  "content/captions"
  "content/music/upbeat"
  "content/music/chill"
  "content/music/dramatic"
  "content/music/minimal"
  "content/templates"
)

for dir in "${CONTENT_DIRS[@]}"; do
  if [[ -d "$PROJECT_ROOT/$dir" ]]; then
    success "$dir already exists"
  else
    mkdir -p "$PROJECT_ROOT/$dir"
    success "Created $dir"
  fi
done

# Add .gitkeep files so empty dirs are tracked (but content is gitignored)
for dir in "${CONTENT_DIRS[@]}"; do
  if [[ ! -f "$PROJECT_ROOT/$dir/.gitkeep" ]]; then
    touch "$PROJECT_ROOT/$dir/.gitkeep"
  fi
done

success "All content directories are ready"

# ---------------------------------------------------------------------------
# 6. Environment file check
# ---------------------------------------------------------------------------
step "Checking environment configuration"

if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
  success ".env.local exists"
else
  warn ".env.local not found. Creating template..."
  cat > "$PROJECT_ROOT/.env.local" <<'ENVEOF'
# ============================================================================
# Content Empire - Environment Variables
# ============================================================================
# Copy this file and fill in your values.

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Ollama (defaults to localhost)
OLLAMA_BASE_URL=http://localhost:11434

# Whisper (optional overrides)
# WHISPER_MODEL=medium
# PYTHON_BIN=python3
# CAPTION_WORKER_PATH=./scripts/caption_worker.py

# Platform API Keys (add as needed)
# TIKTOK_SESSION_ID=
# TWITTER_BEARER_TOKEN=
# YOUTUBE_API_KEY=
ENVEOF
  success "Created .env.local template. Fill in your credentials before running."
fi

# ---------------------------------------------------------------------------
# 7. Supabase migrations note
# ---------------------------------------------------------------------------
step "Database migrations"

echo ""
info "Supabase migrations are located in: supabase/migrations/"
info "To apply them, ensure Supabase CLI is installed and run:"
echo ""
echo "    supabase db push"
echo ""
echo "  Or if using a local Supabase instance:"
echo ""
echo "    supabase start"
echo "    supabase db reset"
echo ""
info "Migration files:"
if [[ -d "$PROJECT_ROOT/supabase/migrations" ]]; then
  ls -1 "$PROJECT_ROOT/supabase/migrations/"*.sql 2>/dev/null | while read -r f; do
    echo "    $(basename "$f")"
  done
else
  warn "No migrations directory found at supabase/migrations/"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN} Content Empire setup complete!${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo "  Next steps:"
echo "    1. Fill in .env.local with your Supabase credentials"
echo "    2. Run database migrations: supabase db push"
echo "    3. Seed initial data: npx tsx scripts/seed-sources.ts"
echo "    4. Start development: npm run dev"
echo "    5. Start cron jobs: npx tsx src/cron.ts"
echo ""
echo "  Optional:"
echo "    - Start Ollama via Docker: docker compose up -d ollama"
echo "    - Test captions: python3 scripts/caption_worker.py input.wav output.srt"
echo ""
success "Happy building!"
