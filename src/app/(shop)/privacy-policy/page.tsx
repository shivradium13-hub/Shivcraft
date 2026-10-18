import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, type LegalSection } from "@/components/shop/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Learn how Shiv Radium collects, uses, protects and handles customer information, including information used for WhatsApp notifications.",
  alternates: { canonical: "/privacy-policy" },
};

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    content: (
      <>
        <p>
          Shiv Radium is an India-based seller of personalised gifts, photo frames, name plates
          and related products through <a className="text-brand-700 underline" href="https://www.shivradium.com">www.shivradium.com</a>.
          This policy explains how personal information is handled when you browse the shop,
          contact us, create an account or place an order.
        </p>
        <p>
          Privacy questions can be sent to <a className="text-brand-700 underline" href="mailto:shivradium13@gmail.com">shivradium13@gmail.com</a>.
          You can also see our <Link className="text-brand-700 underline" href="/support">Help &amp; Support</Link> page.
        </p>
      </>
    ),
  },
  {
    id: "information",
    title: "Information we collect",
    content: (
      <>
        <p>
          Depending on how you use the website, we process the details you give us: your name,
          email address, phone number, account and delivery addresses, product selections, order
          details and customer-support communications.
        </p>
        <p>
          For personalised products, we may receive photographs, names, messages and artwork
          that you upload or type. Technical information such as cookies, login-session data,
          request logs and fraud-prevention signals may also be processed to operate and secure
          the website.
        </p>
        <p>
          Payments are handled through the payment provider enabled at checkout; we receive
          payment references and status information needed to manage an order. Please do not
          send payment card details in support messages or uploaded artwork.
        </p>
      </>
    ),
  },
  {
    id: "purposes",
    title: "How and why we use information",
    content: (
      <p>
        We use information to operate accounts, authenticate sign-ins, process and fulfil orders,
        prepare custom products, arrange delivery, provide invoices and support, prevent abuse
        and meet applicable legal obligations. Optional promotional communication is handled
        separately from necessary order-related communication.
      </p>
    ),
  },
  {
    id: "whatsapp",
    title: "WhatsApp messages and permissions",
    content: (
      <>
        <p>
          When configured, Shiv Radium uses the WhatsApp Business Platform operated by Meta
          to send relevant messages such as order confirmation, dispatch and delivery updates.
          The service may process recipient numbers, message content or template parameters,
          delivery status and message identifiers. Customer communications are also subject
          to WhatsApp and Meta's applicable terms and privacy policies.
        </p>
        <p>
          Where permission is required, we ask for consent before sending WhatsApp messages.
          Marketing messages require the appropriate opt-in and are not automatically
          authorised merely because you placed an order. You can ask us to stop optional
          marketing messages by replying STOP when supported or contacting us at the email above.
          Certain essential order or security messages may still be sent where permitted.
        </p>
      </>
    ),
  },
  {
    id: "providers",
    title: "Service providers and sharing",
    content: (
      <p>
        We share only the information reasonably needed with services used to run the store,
        such as hosting and file storage (including Vercel), payment processing (including
        Razorpay when enabled), delivery partners (including Delhivery when enabled), Meta/
        WhatsApp for messaging, and email-delivery services when configured. Their processing
        is governed by applicable contracts, terms and laws. We may also disclose information
        if legally required or to protect the business and customers from misuse.
      </p>
    ),
  },
  {
    id: "uploads",
    title: "Customer photos and custom artwork",
    content: (
      <p>
        Images and other personalised-design information supplied for an order are used to
        prepare proofs and make the requested product. The website is designed to store
        uploaded images privately and restrict access to authorised parties. Please upload
        only material you have the right to use and avoid unnecessary personal information.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and technical data",
    content: (
      <p>
        The website uses technical mechanisms needed for account sessions, cart continuity,
        security and reliable operation. Any optional analytics or advertising technology,
        if enabled, should be described in the site's applicable cookie or consent notice.
        Browser settings may allow you to restrict cookies, although essential features
        may then stop working.
      </p>
    ),
  },
  {
    id: "retention",
    title: "Storage, retention and security",
    content: (
      <p>
        We keep information only for as long as reasonably needed to operate accounts,
        fulfil orders, handle disputes, secure the service and meet legal, tax or accounting
        obligations. Different kinds of information may have different retention periods.
        We apply reasonable technical and organisational safeguards, but no internet system
        can guarantee absolute security.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your privacy choices and requests",
    content: (
      <p>
        Subject to applicable law, you may ask to access, correct or delete your information
        and withdraw optional communications consent. To request deletion, follow our{" "}
        <Link className="text-brand-700 underline" href="/data-deletion">Data Deletion Instructions</Link>.
        We may verify your identity before acting and may retain records where required by law.
      </p>
    ),
  },
  {
    id: "children-and-changes",
    title: "Children, changes and contact",
    content: (
      <>
        <p>
          Our store is not intended for children to make purchases without a parent or
          guardian's involvement. If you believe a child supplied information improperly,
          contact us to review it.
        </p>
        <p>
          We may update this policy to reflect changes to our services or legal requirements.
          The date above indicates this version. For questions, email{" "}
          <a className="text-brand-700 underline" href="mailto:shivradium13@gmail.com">
            shivradium13@gmail.com
          </a>.
        </p>
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      introduction="We value your trust. This page explains what information Shiv Radium uses to fulfil orders, support customers and provide website and WhatsApp notifications."
      sections={sections}
    />
  );
}
