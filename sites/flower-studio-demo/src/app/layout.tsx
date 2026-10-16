import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'FlowerStudio · 设计工作台', description: '从喜欢的花材出发，为自己的花瓶设计一束花。' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
