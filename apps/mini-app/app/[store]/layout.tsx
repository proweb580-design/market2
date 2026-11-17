import { StoreLayoutRoute, storeParams } from '@repo/ui/storefront/routes';
import { TelegramBridge } from '../telegram-bridge';

export const generateStaticParams = storeParams;

export default function StoreLayout({ children, params }: LayoutProps<'/[store]'>) {
  return (
    <StoreLayoutRoute params={params} basePath={(s) => `/${s}`} variant="miniapp" extras={<TelegramBridge />}>
      {children}
    </StoreLayoutRoute>
  );
}
