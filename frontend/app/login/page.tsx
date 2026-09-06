import { signIn } from '@/auth';

export default function LoginPage() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 text-center shadow-md">
        <h1 className="mb-2 text-xl font-bold">내집</h1>
        <p className="mb-6 text-sm text-gray-500">
          허용된 계정만 접속할 수 있어요.
        </p>
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/' });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Google로 로그인
          </button>
        </form>
      </div>
    </div>
  );
}
