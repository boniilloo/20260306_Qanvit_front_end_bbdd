import { useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Search, LogIn, FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const requestedUrl = useMemo(() => {
    const pathname = location.pathname || "/";
    const search = location.search || "";
    const hash = location.hash || "";
    return `${pathname}${search}${hash}`;
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-10 bg-[#f1f1f1]">
      <div className="w-full max-w-3xl">
        <div className="relative overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#80c8f0]/35 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#7de19a]/25 blur-3xl" />
          </div>

          <div className="relative p-6 sm:p-10">
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-[#1A1F2C] px-3 py-1 text-xs font-semibold text-white">
                    <span className="h-2 w-2 rounded-full bg-[#7de19a]" />
                    FQ Source
                  </div>
                  <h1 className="mt-4 text-5xl sm:text-6xl font-extrabold tracking-tight text-[#1A1F2C]">
                    404
                  </h1>
                  <p className="mt-2 text-base sm:text-lg text-gray-700">
                    We couldn’t find this page.
                  </p>
                  <p className="mt-1 text-sm text-gray-500 break-all">
                    Requested URL: <span className="font-mono">{requestedUrl}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button asChild className="bg-[#1A1F2C] hover:bg-[#1A1F2C]/90">
                  <Link to="/">
                    <Home className="h-4 w-4 mr-2" />
                    Go to Home
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(-1)}
                  className="border-[#1A1F2C]/20 text-[#1A1F2C] hover:bg-[#80c8f0]/15"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                {!user ? (
                  <Button asChild variant="secondary" className="bg-[#80c8f0]/35 hover:bg-[#80c8f0]/45 text-[#1A1F2C]">
                    <Link to="/auth">
                      <LogIn className="h-4 w-4 mr-2" />
                      Sign in
                    </Link>
                  </Button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link
                  to="/supplier-search"
                  className="group rounded-xl border border-black/5 bg-white p-4 hover:bg-[#80c8f0]/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-[#80c8f0]/25 flex items-center justify-center text-[#1A1F2C]">
                      <Search className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-[#1A1F2C]">Search suppliers</div>
                      <div className="text-sm text-gray-500 truncate">Go back to exploring the catalog</div>
                    </div>
                  </div>
                </Link>

                <Link
                  to="/rfxs"
                  className="group rounded-xl border border-black/5 bg-white p-4 hover:bg-[#7de19a]/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-[#7de19a]/25 flex items-center justify-center text-[#1A1F2C]">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-[#1A1F2C]">Go to RFX</div>
                      <div className="text-sm text-gray-500 truncate">Review your projects</div>
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">
          If you think this is a mistake, try refreshing or going back to the previous page.
        </p>
      </div>
    </div>
  );
};

export default NotFound;
