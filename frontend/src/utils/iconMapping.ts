/**
 * Icon mapping utility to help migrate from lucide-react to react-icons
 * This file provides mappings and re-exports for commonly used icons
 */

// Heroicons (hi) - Modern, clean outline style
export {
  HiOutlineViewGrid as LayoutDashboard,
  HiOutlineCalendar as Calendar,
  HiOutlineUserGroup as Users,
  HiOutlineUserCircle as UserCircle,
  HiOutlineCreditCard as CreditCard,
  HiOutlineMail as Mail,
  HiOutlineTrendingUp as TrendingUp,
  HiOutlineTrendingDown as TrendingDown,
  HiOutlineCube as Package,
  // HiOutlineWallet as Wallet, // HiOutlineWallet does not exist in react-icons/hi
  HiOutlineLink as LinkIcon,
  HiOutlineCog as Settings,
  HiOutlineBell as Bell,
  HiOutlineUser as User,
  HiOutlineLogout as LogOut,
  HiOutlineUpload as Upload,
  HiOutlineTrash as Trash2,
  HiOutlineSave as Save,
  HiOutlineRefresh as RefreshCw,
  HiOutlineClock as Clock,
  HiOutlineDocumentText as FileText,
  HiOutlineCollection as Wallet, // Using collection icon for RIB management (collection of bank accounts)
  HiOutlineCurrencyDollar as DollarSign,
  HiOutlineArrowLeft as ArrowLeft,
  HiOutlinePlus as Plus,
  HiOutlinePencil as Pencil,
  HiOutlineX as X,
  HiOutlineSearch as Search,
  HiOutlineStar as Star,
  HiOutlineHome as Home,
  HiOutlineMenu as Menu,
  // HiOutlineCompass as Compass, // HiOutlineCompass does not exist in react-icons/hi
  HiOutlineCalendar as CalendarIcon,
  HiOutlinePencilAlt as Edit,
  HiOutlineChevronDown as ChevronDown,
  HiOutlineEye as Eye,
  HiOutlineEyeOff as EyeOff,
} from 'react-icons/hi';

// Material Design Icons (md) - For variety
export {
  MdEdit as MdEdit,
  MdDelete as MdDelete,
  MdAdd as MdAdd,
  MdSearch as MdSearch,
} from 'react-icons/md';

// Font Awesome (fa) - For more variety
export {
  FaEdit as FaEdit,
  FaTrash as FaTrash,
  FaPlus as FaPlus,
  FaRegCompass as Compass,
} from 'react-icons/fa';

// Note: 'react-icons/ph' does not exist, so these exports are removed.
// export {
//   PhArrowLeft as PhArrowLeft,
//   PhCheck as PhCheck,
// } from 'react-icons/ph';

