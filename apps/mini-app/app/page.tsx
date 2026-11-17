import Link from 'next/link';

// Telegram opens /<store>; this index only helps during local development.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col justify-center gap-3 px-4">
      <p className="label-xs text-muted-foreground">Mini App</p>
      <h1 className="title-xl text-3xl">Brand storefront inside Telegram</h1>
      <Link href="/ashen" className="label-xs font-bold underline">
        Demo store →
      </Link>
    </main>
  );
}
