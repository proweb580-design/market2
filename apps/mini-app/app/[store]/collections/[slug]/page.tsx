import type { Metadata } from 'next';
import { CollectionRoute, collectionParams, collectionTitle } from '@repo/ui/storefront/routes';

export const generateStaticParams = collectionParams;

export async function generateMetadata({ params }: PageProps<'/[store]/collections/[slug]'>): Promise<Metadata> {
  return { title: await collectionTitle(params) };
}

export default function CollectionPage({ params }: PageProps<'/[store]/collections/[slug]'>) {
  return <CollectionRoute params={params} />;
}
