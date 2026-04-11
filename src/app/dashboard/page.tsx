import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Command Center</h1>
        <p className="text-gray-400 mt-1">
          Welcome back, Operator. Here is your empire at a glance.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Views", value: "1.2M", change: "+12.5%", up: true },
          { label: "Subscribers", value: "48.3K", change: "+3.2%", up: true },
          { label: "Revenue", value: "\u00a34,520", change: "+8.1%", up: true },
          { label: "Engagement", value: "6.8%", change: "-0.4%", up: false },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stat.value}</div>
              <p
                className={`text-xs mt-1 ${
                  stat.up ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {stat.change} from last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Placeholder content area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Content Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 flex items-center justify-center text-gray-500">
              Chart data will load here
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 flex items-center justify-center text-gray-500">
              Activity feed will load here
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
