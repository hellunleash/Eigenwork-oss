import { SUPPORT_EMAIL } from "@/lib/contact";

/**
 * Privacy Policy body. Single source of truth — rendered both inside the
 * combined Terms of Service & Privacy Policy page at /terms (the
 * Paddle-approved URL) and on the standalone /privacy page. Update the
 * content here and both surfaces update together.
 *
 * The component renders just the privacy sections — the outer layout
 * (page chrome, heading, "Last updated" timestamp) lives on the
 * consuming pages so each can set its own framing.
 */
export function PrivacyPolicyContent() {
  return (
    <div className="space-y-6 text-gray-700 dark:text-gray-300 leading-relaxed">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">1. Information We Collect</h3>

        <p className="font-medium mt-3">User Account Information:</p>
        <ul className="list-disc pl-6 mt-1 space-y-1">
          <li>Google account information (email, name) obtained through OAuth authentication</li>
          <li>User ID and account creation timestamp</li>
          <li>EigenCredits balance and purchase history</li>
        </ul>

        <p className="font-medium mt-3">Job Description Data:</p>
        <ul className="list-disc pl-6 mt-1 space-y-1">
          <li>Job title, seniority level, role category</li>
          <li>Technical stack requirements (primary, secondary, tertiary)</li>
          <li>Location type, employment type, years of experience required</li>
          <li>Work authorization requirements</li>
          <li>Submission cap and role fit parameters</li>
        </ul>

        <p className="font-medium mt-3">Candidate Application Data:</p>
        <ul className="list-disc pl-6 mt-1 space-y-1">
          <li>Personal information: name, email address</li>
          <li>Resume files (PDF format) uploaded by candidates</li>
          <li>GitHub repository URLs (optional, for junior candidates)</li>
          <li>Project portfolio links</li>
          <li>Work preferences: work types, location preferences, compensation expectations</li>
          <li>Experience level and years of experience</li>
          <li>Work authorization regions</li>
          <li>ETI evaluation scores, role-fit assessments, and evaluation breakdowns</li>
        </ul>

        <p className="font-medium mt-3">Technical Data:</p>
        <ul className="list-disc pl-6 mt-1 space-y-1">
          <li>IP addresses and browser information</li>
          <li>Usage logs and analytics data</li>
          <li>Session storage data (temporarily stored during application submission)</li>
        </ul>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">2. How We Use Your Information</h3>
        <p>We use collected information to:</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>Provide and operate the Platform</li>
          <li>Process candidate applications and generate ETI evaluations</li>
          <li>Perform role-fit matching between candidates and job descriptions</li>
          <li>Process payments and manage EigenCredits</li>
          <li>Authenticate users and manage accounts</li>
          <li>Store resumes and candidate data securely</li>
          <li>Improve Platform functionality and user experience</li>
          <li>Comply with legal obligations and enforce our Terms</li>
        </ul>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">3. Data Processing and AI Services</h3>
        <p>
          Candidate data is processed using third-party AI services:
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li><strong>Resume Processing:</strong> Resume PDFs are sent to Google Document AI to extract text content. The extracted text is then processed by Google Gemini AI for evaluation.</li>
          <li><strong>GitHub Analysis:</strong> For junior candidates who provide GitHub URLs, we access their public repositories via the GitHub API and analyze repository <strong>metadata</strong> (file structure, commit history, dependency manifests) together with <strong>pattern counts</strong> derived from automated text/regex matching over the code. This pattern counting runs locally on our servers (CPU only). Repository <strong>file content is never sent to the LLM (Google Gemini)</strong>; only the resulting non-code signal summary is used to generate ESQ scores.</li>
          <li><strong>Evaluation:</strong> Candidate information, resume text, and the GitHub <strong>signal summary</strong> described above (when available, never raw repository code) are sent to Google Gemini AI to generate ETI scores, role-fit assessments, and evaluation breakdowns.</li>
          <li><strong>Role Matching:</strong> Job descriptions and candidate profiles are compared using Google Gemini AI to determine role-fit compatibility.</li>
        </ul>
        <p className="mt-2">
          All data sent to AI services is processed according to Google&apos;s privacy policies and terms of service. We do not use candidate data to train AI models beyond the scope of generating evaluations for your specific job postings.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">4. Data Storage</h3>
        <p>
          All data is stored using Google Firebase services:
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li><strong>Firestore:</strong> Stores account information, job descriptions, candidate profiles, evaluation results, and metadata</li>
          <li><strong>Firebase Storage:</strong> Stores resume PDF files securely</li>
          <li><strong>Firebase Auth:</strong> Manages user authentication and session data</li>
        </ul>
        <p className="mt-2">
          Data is stored in Google Cloud infrastructure and is subject to Google&apos;s security and privacy practices. We implement industry-standard security measures to protect your data, but no system is completely secure.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">5. Data Sharing and Disclosure</h3>
        <p>We do not sell your personal information. We may share data only in the following circumstances:</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li><strong>With Service Providers:</strong> We share data with third-party service providers (Google, Paddle, GitHub) necessary to operate the Platform, as described in Section 3</li>
          <li><strong>With Users:</strong> Candidate application data and evaluation results are accessible to the user who created the job posting through which the candidate applied</li>
          <li><strong>Legal Requirements:</strong> We may disclose data if required by law, court order, or government regulation</li>
          <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, data may be transferred to the acquiring entity</li>
        </ul>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">6. Cookies and Tracking</h3>
        <p>
          The Platform uses session storage to temporarily store form data during the candidate application process. We do not use persistent cookies for tracking purposes. Firebase Auth may use cookies for session management. Paddle may use cookies for payment processing functionality.
        </p>
        <p className="mt-2">
          You can control cookie settings through your browser preferences. Disabling cookies may affect Platform functionality.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">7. Data Retention</h3>
        <p>
          We retain your data for as long as necessary to provide the Platform and comply with legal obligations:
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li><strong>Account Data:</strong> Retained while your account is active and for a reasonable period after account closure</li>
          <li><strong>Job Descriptions:</strong> Retained until you delete them or close your account</li>
          <li><strong>Candidate Data:</strong> Retained until you delete the associated job posting or request deletion</li>
          <li><strong>Resume Files:</strong> Stored in Firebase Storage until deleted by you or upon account closure</li>
        </ul>
        <p className="mt-2">
          You can delete job postings and candidate data through the Platform dashboard. Deletion requests will be processed within 30 days.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">8. Your Privacy Rights (GDPR/CCPA)</h3>
        <p>If you are located in the European Economic Area (EEA), United Kingdom, or California, you have the following rights:</p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li><strong>Access:</strong> Request a copy of your personal data</li>
          <li><strong>Rectification:</strong> Request correction of inaccurate or incomplete data</li>
          <li><strong>Erasure:</strong> Request deletion of your personal data (&quot;right to be forgotten&quot;)</li>
          <li><strong>Restriction:</strong> Request limitation of processing in certain circumstances</li>
          <li><strong>Data Portability:</strong> Request transfer of your data to another service provider</li>
          <li><strong>Objection:</strong> Object to processing of your data for certain purposes</li>
          <li><strong>Withdraw Consent:</strong> Withdraw consent for data processing where consent is the legal basis</li>
        </ul>
        <p className="mt-2">
          To exercise these rights, please contact us at{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-gray-900 dark:text-gray-100 underline hover:text-gray-700 dark:hover:text-gray-300"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        <p className="mt-2">
          <strong>California Residents:</strong> Under the California Consumer Privacy Act (CCPA), you have the right to know what personal information we collect, the right to delete personal information, and the right to opt-out of the sale of personal information (we do not sell personal information). You will not be discriminated against for exercising your privacy rights.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">9. Security</h3>
        <p>
          We implement technical and organizational measures to protect your data, including:
        </p>
        <ul className="list-disc pl-6 mt-2 space-y-1">
          <li>Encryption of data in transit (HTTPS/TLS)</li>
          <li>Secure authentication via Firebase Auth</li>
          <li>Access controls and authentication requirements</li>
          <li>Regular security assessments</li>
          <li>Secure storage of resume files in Firebase Storage</li>
        </ul>
        <p className="mt-2">
          However, no method of transmission or storage is 100% secure. You use the Platform at your own risk.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">10. Children&apos;s Privacy</h3>
        <p>
          The Platform is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">11. International Data Transfers</h3>
        <p>
          Your data may be processed and stored in the United States and other countries where our service providers operate. By using the Platform, you consent to the transfer of your data to these jurisdictions, which may have different data protection laws than your country of residence.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">12. Changes to Privacy Policy</h3>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be notified through the Platform or via email. Continued use of the Platform after changes constitutes acceptance of the updated Privacy Policy.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">13. Contact Us</h3>
        <p>
          If you have questions about these Terms or our Privacy Policy, please contact EigenWork at:
        </p>
        <p className="mt-2">
          <strong>Company Name:</strong> EigenWork<br />
          <strong>Jurisdiction:</strong> India<br />
          <strong>Email:</strong>{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-gray-900 dark:text-gray-100 underline hover:text-gray-700 dark:hover:text-gray-300"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}
