
import OverviewChart from "@/lib/components/OverviewChart";
import PerformanceChart from "@/lib/components/PerformanceChart";
import StatCard from "@/lib/components/StatCard";
import { MOCK_STATIC, type OccupancyData } from "../lib/mockdata/areadata";
import AreaChart from "@/lib/components/AreaChart";
import { EventLog } from "@/lib/components/EventLog";
const occ = MOCK_STATIC;
export default function Home() {
  return (
    <div className="flex-1 overflow-auto relative z-10">
      <main className="max-w-7xl mx-auto py-4 px-4 log:px-8">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <StatCard name="Total Sales" value="$182,450" />
          <StatCard name="Total Client" value="$1,437" />
          <StatCard name="Total Products" value="674" />
          <StatCard name="Stock" value="12" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <OverviewChart />
          <PerformanceChart />
        </div>
        <div className="mt-6 w-full">
          <AreaChart occ={occ}/>
        </div>
        
        <div className="w-full">
          <EventLog/>
        </div>
      </main>
    </div>
  );
}
