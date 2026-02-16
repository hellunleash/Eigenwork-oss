export function HomeFooter() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="mt-auto border-t border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <p className="text-sm text-gray-500">© {currentYear} EigenWork</p>
          <div className="flex items-center gap-6">
            <a href="/pricing" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Pricing
            </a>
            <a href="/terms" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Terms & Privacy
            </a>
            <a href="mailto:eigenwork.team@gmail.com" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Contact: eigenwork.team@gmail.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
