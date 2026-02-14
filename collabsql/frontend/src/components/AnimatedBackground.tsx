export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange/10 rounded-full mix-blend-normal filter blur-3xl animate-blob"></div>
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-orange-glow/15 rounded-full mix-blend-normal filter blur-3xl animate-blob-slow animation-delay-2000"></div>
      <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-orange/10 rounded-full mix-blend-normal filter blur-3xl animate-blob animation-delay-4000"></div>
    </div>
  );
}
