export default function CheckEmailPage() {
  return (
    <main className="mx-auto max-w-sm px-6 py-24">
      <h1 className="font-display text-2xl font-medium text-white">Check your email</h1>
      <p className="mt-4 text-white/55">
        We&apos;ve sent you a confirmation link. Click it, then{" "}
        <a href="/login" className="text-accent underline">
          log in
        </a>{" "}
        to finish setting up your account.
      </p>
    </main>
  );
}
