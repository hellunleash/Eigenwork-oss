import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — $2 per evaluation",
  description:
    "EigenWork pricing: $2 per candidate evaluation. No subscriptions, no minimums, no expiring credits. Weak-pool protection refunds credits on low-quality applicant pools.",
  alternates: {
    canonical: "/pricing",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    title: "EigenWork Pricing — $2 per evaluation",
    description:
      "Pay per candidate, not per seat. $2 per EigenCredit, no subscription, no expiration, credits refunded on weak applicant pools.",
    url: "/pricing",
    siteName: "EigenWork",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EigenWork Pricing — $2 per evaluation",
    description:
      "Pay per candidate, not per seat. $2 per EigenCredit, no subscription, no expiration.",
  },
};

// Force static generation for crawler accessibility
export const dynamic = 'force-static';
export const revalidate = false;

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-3 tracking-tight">Pricing</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">Simple, transparent pricing for candidate evaluations</p>
        </div>

        {/* Main Pricing Card */}
        <div className="mb-12">
          <div className="bg-white border-2 border-gray-200 rounded-xl shadow-sm overflow-hidden max-w-3xl mx-auto">
            <div className="bg-gray-50 px-6 sm:px-8 py-6 border-b border-gray-200">
              <h2 className="text-2xl font-semibold text-gray-900 mb-1">EigenCredits</h2>
              <p className="text-sm text-gray-600">No subscriptions, no bundles, no minimum purchase</p>
            </div>
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200">
              {/* Credit pricing */}
              <div className="px-6 sm:px-8 py-8">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Credit pricing</h3>
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-5xl sm:text-6xl font-bold text-gray-900">$2</span>
                  <span className="text-lg sm:text-xl text-gray-600">per EigenCredit</span>
                </div>
                <p className="text-sm text-gray-500 mb-4">All prices include applicable taxes</p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  1 EigenCredit covers one completed evaluation. Buy only what you need — credits never expire.
                </p>
              </div>
              {/* Custom pricing */}
              <div className="px-6 sm:px-8 py-8 bg-gray-50/50">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Custom pricing</h3>
                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                  Hiring at scale or need a tailored package? We can align volume, invoicing, and onboarding to your team.
                </p>
                <p className="text-sm text-gray-600">
                  Email{" "}
                  <a
                    href="mailto:eigenwork.team@gmail.com"
                    className="font-medium text-gray-900 underline hover:text-gray-700"
                  >
                    eigenwork.team@gmail.com
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Weak Pool Protection */}
        <div className="mb-12">
          <div className="max-w-2xl mx-auto bg-emerald-50 border border-emerald-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-emerald-900 mb-2">Weak Pool Protection</h2>
            <p className="text-sm text-emerald-900 leading-relaxed">
              If the system flags your <strong>applicant pool</strong> as weak, you can start <strong>New Intake</strong>{" "}
              and we restore the credits spent on that pool. Net effect: you only pay for the{" "}
              <strong>applicant pool you keep</strong>.
            </p>
            <div className="mt-4 bg-white/70 border border-emerald-200 rounded-lg p-4">
              <p className="text-sm text-emerald-900 leading-relaxed">
                <strong>Example:</strong> You evaluate 21 applicants. The system flags the applicant pool as weak. You start{" "}
                <strong>New Intake</strong> and get <strong>21 credits</strong> restored. You then evaluate 30 new
                applicants — <strong>net cost: 30 credits</strong> (not 51).
              </p>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6 text-center">How EigenCredits Work</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700 font-semibold text-sm">
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">1 Credit = 1 Evaluation</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">Each credit is consumed when a candidate submits an application through your intake link</p>
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700 font-semibold text-sm">
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Automatic Deduction</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">Credits are automatically deducted when an applicant completes their evaluation</p>
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700 font-semibold text-sm">
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">No Expiration</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">EigenCredits do not expire—use them whenever you need them</p>
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700 font-semibold text-sm">
                  4
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">No Minimum Purchase</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">Buy as few or as many credits as you need</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Process Flow */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6 text-center">Credit Consumption Process</h2>
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
            <div className="space-y-4">
              {[
                { step: 1, title: "Generate Intake Link", desc: "You create a job posting and receive a unique intake link" },
                { step: 2, title: "Candidates Apply", desc: "Candidates visit your intake link and submit their application (resume, GitHub URL, project links, etc.)" },
                { step: 3, title: "Automatic Evaluation", desc: "Our system automatically evaluates the candidate using our EigenTrustIndex (ETI) scoring system" },
                { step: 4, title: "Credit Deduction", desc: "One EigenCredit is deducted from your account upon successful evaluation" },
                { step: 5, title: "Receive Results", desc: "You receive the evaluation results, including ETI scores, role-fit assessments, and candidate profiles" },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-4">
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-700 flex items-center justify-center text-sm font-semibold shadow-sm">
                    {item.step}
                  </span>
                  <div className="flex-1 pt-1">
                    <h3 className="font-semibold text-gray-900 mb-0.5">{item.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-start gap-3">
                <span className="text-amber-600 text-lg shrink-0">⚠️</span>
                <p className="text-sm text-gray-700 leading-relaxed">
                  <strong>Important:</strong> If your account has zero EigenCredits, intake links will be paused and candidates will not be able to submit applications until you purchase additional credits. Your intake links remain valid and will automatically reactivate when you add credits.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Information */}
        <div className="space-y-8">
          <section className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment Processing</h2>
            <div className="space-y-3 text-gray-700 text-sm leading-relaxed">
              <p>
                All payments are processed securely through Paddle.com, a trusted third-party payment processor. By purchasing EigenCredits, you agree to Paddle&apos;s terms of service and privacy policy, which are available at <a href="https://paddle.com/legal" className="text-gray-900 underline hover:text-gray-700">https://paddle.com/legal</a>.
              </p>
              <p>
                Payments are accepted via credit card, debit card, and other payment methods supported by Paddle. All prices are displayed in USD and include applicable taxes.
              </p>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Refund Policy</h2>
            <div className="space-y-3 text-gray-700 text-sm leading-relaxed">
              <p>
                EigenWork offers refunds in accordance with Paddle&apos;s refund policy and applicable consumer protection laws. If you are not satisfied with your purchase, you may request a refund within 14 days of purchase by contacting Paddle&apos;s customer support.
              </p>
              <p>
                Refund requests will be processed in accordance with Paddle&apos;s standard refund procedures. Once a refund is approved, Paddle will process the refund to your original payment method within 5-10 business days.
              </p>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Getting Started</h2>
            <p className="text-gray-700 text-sm mb-4">To purchase EigenCredits:</p>
            <ol className="list-decimal pl-6 space-y-2 text-gray-700 text-sm leading-relaxed">
              <li>Sign in to your EigenWork account using Google OAuth</li>
              <li>Navigate to your dashboard</li>
              <li>Click &quot;Buy EigenCredits&quot; and enter the quantity you wish to purchase</li>
              <li>Complete the secure checkout process through Paddle</li>
              <li>Credits will be added to your account immediately upon successful payment</li>
            </ol>
          </section>

          <section className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Questions About Pricing?</h2>
            <p className="text-gray-700 text-sm">
              If you have questions about pricing, billing, or EigenCredits, please contact EigenWork at:
            </p>
            <p className="mt-2">
              <a
                href="mailto:eigenwork.team@gmail.com"
                className="text-gray-900 font-medium underline hover:text-gray-700"
              >
                eigenwork.team@gmail.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}