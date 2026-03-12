
import { Home, Search, BookmarkCheck, User, Settings as SettingsIcon, FileText, Users, MessageSquare, BarChart3, Plus, Building2, UserPlus, MessageCircle, Star, Send, Activity } from "lucide-react";
import FQAgent from "./pages/FQAgent";
import SavedSuppliers from "./pages/SavedSuppliers";
import UserProfile from "./pages/UserProfile";
import BuyerProfile from "./pages/BuyerProfile";
import RFXProjects from "./pages/RFXProjects";
import ProtectedSupplierSearch from "./components/ProtectedSupplierSearch";
import Settings from "./pages/Settings";
import Conversations from "./pages/Conversations";
import EmbeddingAnalytics from "./pages/EmbeddingAnalytics";
import AddCompanyToDB from "./pages/AddCompanyToDB";
import MyCompany from "./pages/MyCompany";
import AdminRequests from "./pages/AdminRequests";
import Feedback from "./pages/Feedback";
import DeveloperFeedback from "@/pages/DeveloperFeedback";
import DatabaseCompanyRequests from "@/pages/DatabaseCompanyRequests";
import Traffic from "@/pages/Traffic";

export const navItems = [
  {
    title: "Home",
    to: "/",
    icon: <Home className="h-4 w-4" />,
    page: FQAgent,
  },
  {
    title: "Qanvit Agent", 
    to: "/fq-agent",
    icon: <Search className="h-4 w-4" />,
    page: FQAgent,
  },
  {
    title: "Supplier Search",
    to: "/supplier-search",
    icon: <Users className="h-4 w-4" />,
    page: ProtectedSupplierSearch,
  },
  {
    title: "RFX Projects",
    to: "/rfxs",
    icon: <FileText className="h-4 w-4" />,
    page: RFXProjects,
    authRequired: true,
  },
  {
    title: "Saved Suppliers",
    to: "/saved-suppliers", 
    icon: <BookmarkCheck className="h-4 w-4" />,
    page: SavedSuppliers,
  },
  {
    title: "User Profile",
    to: "/user-profile",
    icon: <User className="h-4 w-4" />,
    page: UserProfile,
  },
  {
    title: "Buyer Profile", 
    to: "/buyer-profile",
    icon: <SettingsIcon className="h-4 w-4" />,
    page: BuyerProfile,
  },
  {
    title: "Add Company to DB", 
    to: "/add-company",
    icon: <Plus className="h-4 w-4" />,
    page: AddCompanyToDB,
    authRequired: true,
  },
  {
    title: "My Company", 
    to: "/my-company",
    icon: <Building2 className="h-4 w-4" />,
    page: MyCompany,
    authRequired: true,
  },
  {
    title: "Settings", 
    to: "/settings",
    icon: <SettingsIcon className="h-4 w-4" />,
    page: Settings,
  },
  {
    title: "Your Feedback", 
    to: "/feedback",
    icon: <Send className="h-4 w-4" />,
    page: Feedback,
    authRequired: true,
  },
  {
    title: "Conversations", 
    to: "/conversations",
    icon: <MessageSquare className="h-4 w-4" />,
    page: Conversations,
    developerOnly: true,
  },
  {
    title: "Embedding Analytics", 
    to: "/embedding-analytics",
    icon: <BarChart3 className="h-4 w-4" />,
    page: EmbeddingAnalytics,
    developerOnly: true,
  },
  {
    title: "Developer Feedback Review",
    to: "/developer-feedback", 
    icon: <MessageSquare className="h-4 w-4" />,
    page: DeveloperFeedback,
    developerOnly: true,
  },
  {
    title: "Admin Requests", 
    to: "/admin-requests",
    icon: <UserPlus className="h-4 w-4" />,
    page: AdminRequests,
    developerOnly: true,
  },
  {
    title: "Database Company Requests",
    to: "/database-company-requests", 
    icon: <Building2 className="h-4 w-4" />,
    page: DatabaseCompanyRequests,
    developerOnly: true,
  },
  {
    title: "Traffic",
    to: "/traffic",
    icon: <Activity className="h-4 w-4" />,
    page: Traffic,
    developerOnly: true,
  },
];
