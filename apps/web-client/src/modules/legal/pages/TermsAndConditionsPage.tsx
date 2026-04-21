import { Link } from 'react-router-dom';
import { BrandedPageHeading } from '@/common/components/BrandedPageHeading';
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTACT_NAME,
  legalContactMailtoHref,
} from '@/common/constants/legalContact';
import { PRODUCT_DISPLAY_NAME } from '@/common/constants/product';
import { ROUTES } from '@/routes/paths';

/**
 * **MVP placeholder** — replace with counsel-approved copy before production if required.
 * Shipped as a normal route chunk via **`React.lazy`** (included in **`vite build`** output).
 */
export function TermsAndConditionsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <main
        className="text-foreground mx-auto w-full max-w-2xl px-6 py-10 sm:py-14"
        id="terms-and-conditions-main"
      >
        <div className="mb-8">
          <BrandedPageHeading>Terms and Conditions</BrandedPageHeading>
          <p className="text-muted mt-3 text-sm">
            Last updated: {new Date().toISOString().slice(0, 10)} (placeholder — set a fixed date when
            copy is finalized)
          </p>
        </div>

        <article
          className="max-w-none [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:text-muted [&_p]:leading-relaxed"
          aria-label={`${PRODUCT_DISPLAY_NAME} terms and conditions`}
        >
          <section aria-labelledby="terms-overview" className="mt-6">
            <h2 id="terms-overview">Overview</h2>
            <p>
              These Terms and Conditions (“Terms”) govern your access to and use of {PRODUCT_DISPLAY_NAME}. This page
              is an <strong>MVP placeholder</strong> for transparency; it is not legal advice. Replace this text with
              terms reviewed for your jurisdiction before a public launch.
            </p>
          </section>

          <section aria-labelledby="terms-acceptance" className="mt-6">
            <h2 id="terms-acceptance">Acceptance</h2>
            <p>
              By creating an account, using a guest session where offered, or otherwise using the service, you agree
              to these Terms and to any additional policies we reference here (such as our Privacy Policy).
            </p>
          </section>

          <section aria-labelledby="terms-use" className="mt-6">
            <h2 id="terms-use">Use of the service</h2>
            <p>
              You may use {PRODUCT_DISPLAY_NAME} only in compliance with applicable law and these Terms. We grant you a
              limited, revocable right to use the client and APIs as intended for personal or internal organizational
              messaging, subject to the limits of your plan or deployment.
            </p>
          </section>

          <section aria-labelledby="terms-account" className="mt-6">
            <h2 id="terms-account">Account and security</h2>
            <p>
              You are responsible for safeguarding your credentials and for activity under your account. Notify{' '}
              <strong>{LEGAL_CONTACT_NAME}</strong> promptly if you suspect unauthorized access (
              <a
                href={legalContactMailtoHref()}
                className="text-accent font-medium underline hover:no-underline"
              >
                {LEGAL_CONTACT_EMAIL}
              </a>
              ).
            </p>
          </section>

          <section aria-labelledby="terms-acceptable-use" className="mt-6">
            <h2 id="terms-acceptable-use">Acceptable use</h2>
            <p>
              You agree not to misuse the service — for example by attempting to disrupt others’ communications, probe
              or bypass security, or use the service to distribute malware or unlawful content. We may suspend or
              terminate access for violations, subject to the enforcement approach described when copy is finalized.
            </p>
          </section>

          <section aria-labelledby="terms-disclaimers" className="mt-6">
            <h2 id="terms-disclaimers">Disclaimers</h2>
            <p>
              The service is provided “as is” to the extent permitted by law. We do not warrant uninterrupted or
              error-free operation. End-to-end encryption and related features depend on correct client configuration
              and user behavior — see product documentation.
            </p>
          </section>

          <section aria-labelledby="terms-liability" className="mt-6">
            <h2 id="terms-liability">Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, our aggregate liability arising from these Terms or the service
              is limited as set forth in a finalized agreement (placeholder — specify caps and carve-outs for your
              entity).
            </p>
          </section>

          <section aria-labelledby="terms-changes" className="mt-6">
            <h2 id="terms-changes">Changes</h2>
            <p>
              We may update these Terms from time to time. We will indicate the “last updated” date above when
              material changes are published (placeholder — describe notice mechanics: email, in-app banner, etc.).
            </p>
          </section>

          <section aria-labelledby="terms-contact" className="mt-6">
            <h2 id="terms-contact">Contact</h2>
            <p>
              For questions about these Terms, contact <strong>{LEGAL_CONTACT_NAME}</strong> at{' '}
              <a
                href={legalContactMailtoHref()}
                className="text-accent font-medium underline hover:no-underline"
              >
                {LEGAL_CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </article>

        <p className="text-muted mt-10 text-center text-sm">
          <Link to={ROUTES.home} className="text-accent font-medium hover:underline">
            Back to home
          </Link>
        </p>
      </main>
    </div>
  );
}
