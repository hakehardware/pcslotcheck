export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-50">
        Support
      </h1>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold text-zinc-50">Tip Directly</h2>
        <p className="mt-3 text-zinc-400">
          Tips go directly toward lab hardware, upgrades, and producing more
          content.
        </p>
        <a
          href="https://buymeacoffee.com/hakehardware"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block rounded-lg bg-zinc-50 px-6 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
        >
          Buy Me a Coffee
        </a>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold text-zinc-50">
          Shop Affiliate Links
        </h2>
        <p className="mt-3 text-zinc-400">
          Using affiliate links costs you nothing extra. When you shop through
          them, a small commission helps fund lab hardware and future content.
        </p>
        <a
          href="https://www.amazon.com/shop/hakehardware"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block rounded-lg bg-zinc-50 px-6 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
        >
          Amazon Storefront
        </a>
        <p className="mt-4 text-sm text-zinc-500">
          Affiliate relationships do not influence review scores or
          recommendations.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold text-zinc-50">
          Follow and Subscribe
        </h2>
        <p className="mt-3 text-zinc-400">
          Subscribing, following, and sharing helps the channel grow and reach
          more people. Every follow counts.
        </p>
        <a
          href="https://www.youtube.com/@hakehardware"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block rounded-lg bg-zinc-50 px-6 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
        >
          Hake Hardware on YouTube
        </a>
      </section>

      <p className="mt-16 text-center text-zinc-500">
        Thank you for being part of the community. Whether you tip, shop through
        affiliate links, or simply watch the videos — every bit of support
        matters and is genuinely appreciated.
      </p>
    </div>
  );
}
