import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from "lucide-react";

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 flex gap-3 text-sm",
  {
    variants: {
      variant: {
        default: "bg-gray-900 border-gray-800 text-gray-300",
        info: "bg-blue-500/10 border-blue-500/20 text-blue-300",
        success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
        warning: "bg-amber-500/10 border-amber-500/20 text-amber-300",
        danger: "bg-red-500/10 border-red-500/20 text-red-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const iconMap = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "default", title, dismissible, onDismiss, children, ...props }, ref) => {
    const Icon = iconMap[variant || "default"];

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          {title && (
            <h5 className="mb-1 font-medium leading-none tracking-tight text-white">
              {title}
            </h5>
          )}
          <div className="text-sm opacity-90">{children}</div>
        </div>
        {dismissible && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 rounded-md p-1 hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
);
Alert.displayName = "Alert";

export { Alert, alertVariants };
