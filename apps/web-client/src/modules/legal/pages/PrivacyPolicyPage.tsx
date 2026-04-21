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
export function PrivacyPolicyPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <main
        className="text-foreground mx-auto w-full max-w-2xl px-6 py-10 sm:py-14"
        id="privacy-policy-main"
      >
        <div className="mb-8">
          <BrandedPageHeading>Privacy Policy</BrandedPageHeading>
          <p className="text-muted mt-3 text-sm">
            Last updated: {new Date().toISOString().slice(0, 10)} (placeholder — set a fixed date when
            copy is finalized)
          </p>
        </div>

        <article
          className="max-w-none [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:text-muted [&_p]:leading-relaxed"
          aria-label={`${PRODUCT_DISPLAY_NAME} privacy policy details`}
        >
          <section aria-labelledby="privacy-overview" className="mt-6">
            <h2 id="privacy-overview">Overview</h2>
            <p>
              This Privacy Policy describes how {PRODUCT_DISPLAY_NAME} (“we”, “us”) handles information when you use
              our messaging service. This page is an <strong>MVP placeholder</strong> for transparency; it is not
              legal advice. Replace this text with a policy reviewed for your jurisdiction before a public launch.
            </p>
          </section>

          <section aria-labelledby="privacy-account" className="mt-6">
            <h2 id="privacy-account">Account and profile</h2>
            <p>
              To provide chat, we process account details you provide (such as email and display name where
              applicable) and technical data needed to operate the service (for example identifiers used for
              authentication and routing).
            </p>
          </section>

          <section aria-labelledby="privacy-messages" className="mt-6">
            <h2 id="privacy-messages">Messages and encryption</h2>
            <p>
              {PRODUCT_DISPLAY_NAME} is designed so message content is end-to-end encrypted where that feature is
              enabled: the server stores ciphertext and related metadata needed to deliver messages, not plaintext
              content. Exact fields depend on the product implementation — see technical documentation for the current
              wire format.
            </p>
          </section>

          <section aria-labelledby="privacy-retention" className="mt-6">
            <h2 id="privacy-retention">Retention</h2>
            <p>
              We retain information as needed to run the service and as described in our operational configuration
              (including guest-session or TTL behavior where applicable). Specific retention periods should be
              documented here when finalized.
            </p>
          </section>

          <section aria-labelledby="privacy-contact" className="mt-6">
            <h2 id="privacy-contact">Contact</h2>
            <p>
              For privacy requests or questions, contact{' '}
              <strong>{LEGAL_CONTACT_NAME}</strong> at{' '}
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
