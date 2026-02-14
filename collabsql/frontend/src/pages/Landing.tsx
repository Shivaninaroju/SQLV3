import AnimatedBackground from '../components/AnimatedBackground';
import Hero from '../components/Hero';
import Features from '../components/Features';
import HowItWorks from '../components/HowItWorks';

export default function Landing() {
  return (
    <div className="min-h-screen bg-black text-text-primary font-body">
      <AnimatedBackground />
      <Hero />
      <Features />
      <HowItWorks />
    </div>
  );
}
