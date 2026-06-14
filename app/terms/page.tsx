import type { Metadata } from "next";
import { PrivacyPolicyContent } from "@/app/components/privacy-policy-content";

export const metadata: Metadata = {
  title: "Terms of Service & Privacy Policy",
  description: "Terms of Service and Privacy Policy for EigenWork platform.",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

// Force static generation for crawler accessibility
export const dynamic = 'force-static';
export const revalidate = false;

export default function TermsPage() {
  // Use static date for SSR compatibility
  const lastUpdated = "February 11, 2025";
  
  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0e] py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">Terms of Service & Privacy Policy</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: {lastUpdated}</p>

        <div className="prose prose-sm max-w-none space-y-8">
          {/* TERMS OF SERVICE */}
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Terms of Service</h2>
            
            <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">1. Acceptance of Terms</h3>
                <p>
                  These Terms of Service and Privacy Policy (&quot;Terms&quot;) are entered into between you (&quot;User&quot;, &quot;you&quot;, &quot;your&quot;) and EigenWork (&quot;EigenWork&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;, &quot;Company&quot;). By accessing or using EigenWork (&quot;the Platform&quot;, &quot;Service&quot;), you agree to be bound by these Terms. If you do not agree, please do not use the Platform.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">2. Description of Service</h3>
                <p>
                  EigenWork is a technical candidate evaluation platform designed for startups. The Platform enables users to:
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>Create job role descriptions and generate intake links</li>
                  <li>Receive candidate applications through intake links</li>
                  <li>Automatically evaluate candidates using our EigenTrustIndex (ETI) scoring system</li>
                  <li>View evaluation results, including ETI scores, role fit assessments, and candidate profiles</li>
                </ul>
                <p className="mt-2">
                  The Platform uses artificial intelligence (AI) models, including Google Gemini AI, to analyze candidate resumes and other submitted materials to generate evaluation scores and insights. For junior candidates, GitHub repositories are analyzed using metadata and locally-computed (CPU-only) pattern counts; repository code itself is not sent to the AI model (see the Privacy Policy for details). The Platform does not make hiring decisions on your behalf—it provides evaluation data to assist your decision-making process.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">3. Account Creation and Authentication</h3>
                <p>
                  To use the Platform as a user, you must create an account using Google OAuth authentication. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">4. EigenCredits and Payment Processing</h3>
                <p>
                  EigenWork operates on a credit-based system. You purchase EigenCredits, which are consumed when candidates submit applications through your intake links. Each candidate evaluation consumes one EigenCredit.
                </p>
                <p className="mt-2">
                  Payments are processed through Paddle.com (&quot;Paddle&quot;), a third-party payment processor. By purchasing EigenCredits, you agree to Paddle&apos;s terms of service and privacy policy, which are available at https://paddle.com/legal.
                </p>
                <p className="mt-2">
                  <strong>Refund Policy:</strong> EigenWork offers refunds in accordance with Paddle&apos;s refund policy and applicable consumer protection laws. If you are not satisfied with your purchase, you may request a refund within 14 days of purchase by contacting Paddle&apos;s customer support. Refund requests will be processed in accordance with Paddle&apos;s standard refund procedures. Once a refund is approved, Paddle will process the refund to your original payment method within 5-10 business days.
                </p>
                <p className="mt-2">
                  EigenCredits do not expire, but they are non-transferable. If your account has zero EigenCredits, intake links will be paused until you purchase additional credits.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">5. Candidate Data and Evaluation</h3>
                <p>
                  When candidates apply through your intake links, they provide personal information, resumes, GitHub repository URLs (optional), project links, work preferences, and compensation expectations. This data is processed using AI models to generate ETI scores and evaluation insights.
                </p>
                <p className="mt-2">
                  ETI scores are calculated using multiple evaluation blocks:
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li><strong>For Junior Candidates:</strong> ESQ (Evidence of Skill Quality), PDQ (Problem-solving, Decision-making, Quality), and NR (Narrative Realism)</li>
                  <li><strong>For Senior Candidates:</strong> OM (Operating Maturity), OD (Operating Depth), and PC (Performance Capacity)</li>
                </ul>
                <p className="mt-2">
                  Scores are normalized to a 0-100 scale. Candidates with scores below 50 are not considered matchable. The Platform also performs role-fit matching using AI to compare candidate profiles against job descriptions.
                </p>
                <p className="mt-2">
                  <strong>Important:</strong> ETI scores and evaluations are generated by AI models and are provided for informational purposes only. We do not guarantee the accuracy, completeness, or reliability of any evaluation results. You are solely responsible for making hiring decisions based on the information provided.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">6. Use of AI APIs and Third-Party Services</h3>
                <p>
                  The Platform uses the following third-party AI and data processing services:
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li><strong>Google Gemini AI (gemini-2.5-flash):</strong> Used for candidate evaluation, role-fit matching, and job description parsing</li>
                  <li><strong>Google Document AI:</strong> Used to extract text from resume PDFs</li>
                  <li><strong>GitHub API:</strong> Used to read repository metadata and code for junior candidates (when GitHub URLs are provided); code is processed locally for pattern counting and is not sent to the AI model</li>
                  <li><strong>Firebase (Google):</strong> Used for authentication, data storage (Firestore), and file storage (Storage)</li>
                  <li><strong>Paddle:</strong> Used for payment processing</li>
                </ul>
                <p className="mt-2">
                  By using the Platform, you acknowledge that candidate data may be processed by these third-party services in accordance with their respective privacy policies and terms of service.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">7. Acceptable Use</h3>
                <p>You agree not to:</p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>Use the Platform for any illegal or unauthorized purpose</li>
                  <li>Submit false, misleading, or fraudulent information</li>
                  <li>Interfere with or disrupt the Platform&apos;s operation or security</li>
                  <li>Attempt to reverse engineer, decompile, or extract source code from the Platform</li>
                  <li>Use automated systems to scrape or harvest data from the Platform</li>
                  <li>Share intake links in a manner that violates applicable employment or anti-discrimination laws</li>
                  <li>Use the Platform to discriminate against candidates based on protected characteristics</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">8. Intellectual Property</h3>
                <p>
                  The Platform, including its design, functionality, ETI scoring algorithms, and evaluation methodologies, is the property of EigenWork (&quot;EigenWork&quot;, &quot;the Company&quot;) and its licensors. You may not copy, modify, distribute, or create derivative works based on the Platform without EigenWork&apos;s express written permission.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">9. Disclaimers and Limitations of Liability</h3>
                <p>
                  <strong>No Guarantees:</strong> The Platform is provided &quot;as is&quot; without warranties of any kind. We do not guarantee that:
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-1">
                  <li>ETI scores accurately reflect candidate qualifications or potential</li>
                  <li>Evaluations will result in successful hires</li>
                  <li>The Platform will be error-free, secure, or continuously available</li>
                  <li>AI-generated insights are accurate or complete</li>
                </ul>
                <p className="mt-2">
                  <strong>Limitation of Liability:</strong> To the maximum extent permitted by law, EigenWork and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including lost profits, data loss, or business interruption, arising from your use of the Platform.
                </p>
                <p className="mt-2">
                  <strong>Hiring Decisions:</strong> You are solely responsible for all hiring decisions. The Platform provides evaluation tools and data, but does not make hiring decisions on your behalf. We are not responsible for the outcomes of your hiring decisions.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">10. Termination</h3>
                <p>
                  We reserve the right to suspend or terminate your account at any time for violation of these Terms or for any other reason we deem necessary. Upon termination, your access to the Platform will cease, but candidate data associated with your account may be retained as described in our Privacy Policy.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">11. Changes to Terms</h3>
                <p>
                  We may modify these Terms at any time. Material changes will be notified through the Platform or via email. Continued use of the Platform after changes constitutes acceptance of the modified Terms.
                </p>
              </div>
            </div>
          </section>

          {/* PRIVACY POLICY — shared component, also rendered standalone at /privacy */}
          <section className="mt-12">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Privacy Policy</h2>
            <PrivacyPolicyContent />
          </section>
        </div>
      </div>
    </div>
  );
}
