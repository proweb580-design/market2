import { HomeRoute } from '@repo/ui/storefront/routes';

export default function StoreHome({ params }: PageProps<'/[store]'>) {
  return <HomeRoute params={params} />;
}
