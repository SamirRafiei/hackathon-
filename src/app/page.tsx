export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-20">
      <p className="mb-6 w-fit rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        Pact
      </p>
      <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
        Make a pact.
        <br />
        Keep it fair.
      </h1>
      <p className="mt-6 max-w-lg text-lg text-muted-foreground">
        Project foundation ready. Product features will be built by the team.
      </p>
    </main>
  );
}
