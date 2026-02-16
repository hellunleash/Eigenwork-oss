export function HomeFeatures() {
  return (
    <section className="py-16 md:py-20 border-t border-gray-100">
      <div className="max-w-6xl mx-auto px-6">
        <p 
          className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-2 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "0.1s", animationFillMode: "forwards" }}
        >
          Built for technical hiring
        </p>
        <h2 
          className="text-2xl md:text-3xl font-semibold text-gray-900 mb-12 opacity-0 animate-fade-in-up"
          style={{ animationDelay: "0.15s", animationFillMode: "forwards" }}
        >
          Data-driven, risk-aware hiring
        </h2>
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {[
            { title: "Data driven results", desc: "AI-powered technical evaluation with comprehensive trust metrics and ETI scores." },
            { title: "Risk assessment", desc: "Identify potential issues before making hiring decisions." },
            { title: "Automated screening", desc: "Reduce time-to-hire with automated candidate evaluation." },
          ].map((item, i) => (
            <div
              key={i}
              className="p-6 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition-all duration-300 opacity-0 animate-fade-in-up"
              style={{ animationDelay: `${0.2 + i * 0.08}s`, animationFillMode: "forwards" }}
            >
              <h3 className="font-semibold text-gray-900 mb-2">{item.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
