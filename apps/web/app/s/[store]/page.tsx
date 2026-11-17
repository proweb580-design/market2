import { HomeRoute } from '@repo/ui/storefront/routes';

export default function StoreHome({ params }: PageProps<'/s/[store]'>) {
  return <HomeRoute params={params} />;
}
