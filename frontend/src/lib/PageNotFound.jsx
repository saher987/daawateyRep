import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function PageNotFound() {
    const location = useLocation();
    const pageName = location.pathname.substring(1);

    const { data: authData, isFetched } = useQuery({
        queryKey: ['user'],
        queryFn: async () => {
            try {
                const user = await base44.auth.me();
                return { user, isAuthenticated: true };
            } catch (error) {
                return { user: null, isAuthenticated: false };
            }
        }
    });
    
    return (
        <div dir="rtl" className="min-h-screen flex items-center justify-center p-6 bg-background">
            <div className="max-w-md w-full text-center space-y-6">
                <div className="space-y-2">
                    <h1 className="text-7xl font-display font-light text-muted-foreground/30">404</h1>
                    <div className="h-0.5 w-16 bg-border mx-auto"></div>
                </div>
                <div className="space-y-3">
                    <h2 className="text-2xl font-semibold text-foreground">الصفحة غير موجودة</h2>
                    <p className="text-muted-foreground">
                        الصفحة التي تبحث عنها غير موجودة
                    </p>
                </div>
                {isFetched && authData?.isAuthenticated && authData?.user?.role === 'admin' && (
                    <div className="p-4 bg-muted rounded-xl border border-border text-right">
                        <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">ملاحظة:</span> هذه الصفحة لم يتم إنشاؤها بعد.
                        </p>
                    </div>
                )}
                <div className="pt-4">
                    <button 
                        onClick={() => window.location.href = '/'} 
                        className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors"
                    >
                        العودة للرئيسية
                    </button>
                </div>
            </div>
        </div>
    )
}