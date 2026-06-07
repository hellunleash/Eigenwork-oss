export function HomeFooter() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="mt-auto border-t border-gray-200 dark:border-white/[0.05] bg-white dark:bg-[#0a0a0e] transition-colors duration-300">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">© {currentYear} EigenWork</p>
          <div className="flex items-center gap-6">
            <a href="/pricing" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              Pricing
            </a>
            <a href="/terms" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              Terms & Privacy
            </a>
            <a href="mailto:eigenwork.team@gmail.com" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              Contact: eigenwork.team@gmail.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
