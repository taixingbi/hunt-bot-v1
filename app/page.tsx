import pkg from "../package.json";

export const dynamic = "force-dynamic";

export default function Home() {
  const version = process.env.APP_VERSION ?? pkg.version;
  return (
    <div className="relative w-screen h-screen flex items-center justify-center flex-col gap-4">
      <a href="/chat" className="text-3xl font-bold">
        Go to chat &#8594;
      </a>

      <p className="opacity-60 text-sm">Taixing Personal Chat Bot</p>

      {version && (
        <p className="absolute bottom-4 left-4 opacity-40 text-xs">Version {version}</p>
      )}
    </div>
  );
}
