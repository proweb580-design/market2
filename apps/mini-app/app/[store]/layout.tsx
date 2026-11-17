import { StoreLayoutRoute, storeParams } from '@repo/ui/storefront/routes';

export const generateStaticParams = storeParams;

export default function StoreLayout({ children, params }: LayoutProps<'/[store]'>) {
  return (
    <StoreLayoutRoute params={params} basePath={(s) => `/${s}`} variant="miniapp">
      {children}
    </StoreLayoutRoute>
  );
}
