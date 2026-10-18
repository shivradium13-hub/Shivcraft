import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, type LegalSection } from "@/components/shop/LegalPage";

export const metadata: Metadata = {
  title: "Data Deletion Instructions",
  description: "How to request access, correction or deletion of personal data held by Shiv Radium.",
  alternates: { canonical: "/data-deletion" },
};

const sections: LegalSection[] = [
  {
    id: "request",
    title: "How to request deletion",
    content: (
      <>
        <p>
          Email <a className="text-brand-700 underline" href="mailto:shivradium13@gmail.com?subject=Data%20Deletion%20Request">
            shivradium13@gmail.com
          </a> with the subject <strong>Data Deletion Request</strong>.
          Use the email address associated with your Shiv Radium account if possible.
        </p>
        <p>
          Tell us whether you wish to delete your customer account, order-related personal
          information, uploaded custom-design materials, or WhatsApp communication records
          that we control. A relevant order number can help locate information if needed.
          Do not send passwords, OTPs, bank card details or identity documents in your
          initial request.
        </p>
      </>
    ),
  },
  {
    id: "verification",
    title: "How we verify and process a request",
    content: (
      <p>
        We may ask for limited information to confirm that the request comes from the
        person authorised to access the account. We then review what information we hold,
        what can be deleted or de-identified and what we must preserve. We will respond
        and process eligible requests within applicable legal requirements, and inform
        you if further verification or an applicable exception is needed.
      </p>
    ),
  },
  {
    id: "data",
    title: "What information can be reviewed",
    content: (
      <p>
        Depending on your use of the service, a request may cover profile and contact
        details, saved addresses, optional communication preferences, uploaded photos
        and custom artwork, and customer-service records. Order and transaction records
        may have to be retained to meet tax, accounting, fraud-prevention or legal
        obligations, even after an account is deleted.
      </p>
    ),
  },
  {
    id: "whatsapp",
    title: "WhatsApp notifications and messages",
    content: (
      <p>
        You can ask us to remove WhatsApp-related personal information that we hold and
        to stop optional marketing communications. You may also reply STOP to a marketing
        message where that option is supported. Deleting our records cannot remove
        messages stored on your own device, another person's device, or from Meta's
        systems; those services have separate controls and policies.
      </p>
    ),
  },
  {
    id: "correction",
    title: "Correcting information and other privacy questions",
    content: (
      <p>
        To correct an email, name, phone number or address, use any available account
        settings or email us with the subject <strong>Data Correction Request</strong>.
        For information on how we collect and use data, read our{" "}
        <Link className="text-brand-700 underline" href="/privacy-policy">Privacy Policy</Link>.
        You can also visit <Link className="text-brand-700 underline" href="/support">Help &amp; Support</Link>.
      </p>
    ),
  },
];

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Data Deletion Instructions"
      introduction="You can ask Shiv Radium to review, correct or delete personal information we hold about you. There is no need to share your password or an OTP."
      sections={sections}
    />
  );
}
