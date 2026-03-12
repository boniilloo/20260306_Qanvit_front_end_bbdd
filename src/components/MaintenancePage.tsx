import { Wrench, Clock, Mail } from "lucide-react";

const MaintenancePage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-8 md:p-12 text-center">
        {/* Logo/Icon */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-4">
            <Wrench className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-2">
            Qanvit
          </h1>
          <p className="text-lg text-gray-600">
            We're making improvements
          </p>
        </div>

        {/* Main Message */}
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-800 mb-4">
            Site Under Maintenance
          </h2>
          <p className="text-gray-600 text-lg leading-relaxed mb-6">
            We are working to improve your experience. Our team is implementing 
            new features and optimizations to provide you with an even better service.
          </p>
        </div>

        {/* Status Info */}
        <div className="bg-blue-50 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-center mb-3">
            <Clock className="w-5 h-5 text-blue-600 mr-2" />
            <span className="font-semibold text-blue-800">Estimated Time</span>
          </div>
          <p className="text-blue-700">
            We'll be back shortly. Thank you for your patience.
          </p>
        </div>

        {/* Contact Info */}
        <div className="border-t pt-6">
          <p className="text-gray-600 mb-4">
            Need urgent assistance?
          </p>
          <div className="flex items-center justify-center">
            <Mail className="w-4 h-4 text-gray-500 mr-2" />
            <a 
              href="mailto:contact@fqsource.com" 
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              contact@fqsource.com
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t">
          <p className="text-sm text-gray-500">
            © 2024 Qanvit. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MaintenancePage;
