import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, type LegalSection } from "@/components/shop/LegalPage";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms for purchasing personalised gifts and using the Shiv Radium website.",
  alternates: { canonical: "/terms-and-conditions" },
};

const sections: LegalSection[] = [
  {
    id: "scope",
    title: "Using Shiv Radium",
    content: (
      <p>
        These terms apply when you browse or purchase products through{" "}
        <a className="text-brand-700 underline" href="https://www.shivradium.com">www.shivradium.com</a>.
        The store offers made-to-order gifts, name plates, photo frames and other personalised
        items. By placing an order you agree to these terms, subject to rights that cannot
        be excluded under applicable Indian law.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and accurate details",
    content: (
      <p>
        Keep your login credentials and OTPs private, and provide accurate contact, delivery
        and order information. You are responsible for checking the spelling of names,
        photo selections, dimensions and custom instructions before placing your order.
        Tell us promptly if you notice an error.
      </p>
    ),
  },
  {
    id: "customisation",
    title: "Personalised products and artwork approval",
    content: (
      <p>
        Personalised products are produced from the details and images you provide. Where we
        offer an artwork proof, review it carefully and approve it before production. Small
        differences in screen colour, material texture and manufacturing tolerances may occur.
        These do not affect any remedies available where goods are defective, misdescribed or
        otherwise fail to meet applicable consumer protection requirements.
      </p>
    ),
  },
  {
    id: "orders",
    title: "Orders, prices and payment",
    content: (
      <p>
        The product page and checkout show the current price, available payment methods,
        taxes and any shipping charge before you place an order. An order is subject to
        payment confirmation and acceptance. If we cannot fulfil it, we will contact you
        about available options, including a refund where appropriate.
      </p>
    ),
  },
  {
    id: "shipping",
    title: "Production, shipping and delivery",
    content: (
      <p>
        Custom items require preparation time before dispatch. Delivery estimates can vary
        by product, customisation and destination and are not guarantees unless expressly
        agreed. Please provide an accessible, accurate delivery address. Tracking, when
        available, can be viewed using your order account or the courier&rsquo;s tracking service.
      </p>
    ),
  },
  {
    id: "returns",
    title: "Cancellations, returns and refunds",
    content: (
      <>
        <p>
          A cancellation or modification may be possible before the relevant production or
          dispatch stage; contact us as soon as possible. For goods custom-made to your
          specifications, change-of-mind returns may not be available once production
          begins. However, this does not limit your statutory rights.
        </p>
        <p>
          If an item is damaged, defective, incorrect or does not match the approved proof,
          contact <Link className="text-brand-700 underline" href="/support">Help &amp; Support</Link>{" "}
          with your order reference and photographs where useful. We will review the issue
          and arrange an appropriate remedy under the circumstances and applicable law,
          which may include replacement, repair or refund.
        </p>
      </>
    ),
  },
  {
    id: "customer-content",
    title: "Photos and content supplied by customers",
    content: (
      <p>
        Only submit photos, designs and text you own or have permission to use. You give us
        permission to use submitted materials as needed to prepare a proof and fulfil your
        order. Do not submit unlawful, infringing, harmful or misleading material.
        You retain any intellectual-property rights you hold in your own submitted content.
      </p>
    ),
  },
  {
    id: "site-use",
    title: "Website content and permitted use",
    content: (
      <p>
        The website&rsquo;s original branding, product images and other content belong to
        Shiv Radium or their respective owners. You may browse and purchase through the
        site for lawful purposes, but must not misuse accounts, interfere with services,
        attempt unauthorised access or copy protected materials without permission.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Availability and legal rights",
    content: (
      <p>
        We aim to keep the website accurate and available, but occasional technical
        interruptions may occur. Nothing in these terms excludes or restricts liability,
        remedies or consumer rights that applicable law does not permit us to exclude.
        These terms are governed by applicable Indian law, subject to any mandatory
        consumer jurisdiction and dispute-resolution protections.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Questions and updates",
    content: (
      <p>
        For order problems or questions, visit{" "}
        <Link className="text-brand-700 underline" href="/support">Help &amp; Support</Link>
        {" "}or email{" "}
        <a className="text-brand-700 underline" href="mailto:shivradium13@gmail.com">shivradium13@gmail.com</a>.
        We may revise these terms as products, services or legal requirements change.
        Our <Link className="text-brand-700 underline" href="/privacy-policy">Privacy Policy</Link>{" "}
        explains how personal information is handled.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      introduction="Please read these terms before ordering a personalised product from Shiv Radium. Your applicable consumer rights remain protected."
      sections={sections}
    />
  );
}
