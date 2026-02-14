import { Sparkles, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Hero() {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-screen flex items-center justify-center px-6 py-24">
      <div className="max-w-6xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black-card border border-black-border mb-8 animate-float">
          <Sparkles className="w-4 h-4 text-orange" />
          <span className="text-text-secondary text-sm font-body">AI-Powered SQL Copilot</span>
        </div>

        <h1 className="font-heading font-bold text-6xl md:text-7xl lg:text-8xl mb-6 leading-tight tracking-tight">
          AI-Powered SQL <span className="text-orange">Intelligence</span>
        </h1>

        <p className="text-text-secondary text-lg md:text-xl max-w-3xl mx-auto mb-12 leading-relaxed font-body">
          Generate, execute, and analyze SQL queries using natural language.
          Work smarter with your database through intelligent AI assistance.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            onClick={() => navigate('/auth')}
            className="group px-8 py-4 bg-orange rounded-2xl font-body font-semibold text-black transition-all duration-300 hover:bg-orange-hover hover:shadow-[0_0_40px_rgba(255,106,0,0.4)] hover:scale-105 flex items-center gap-2"
          >
            Get Started
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </button>

          <button className="px-8 py-4 bg-transparent border-2 border-orange text-text-primary rounded-2xl font-body font-semibold transition-all duration-300 hover:bg-orange/10 hover:border-orange-hover hover:scale-105">
            View Demo
          </button>
        </div>

        <div className="mt-16 flex flex-wrap justify-center items-center gap-8 text-text-muted text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-orange rounded-full"></div>
            <span>No credit card required</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-orange rounded-full"></div>
            <span>Free 14-day trial</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-orange rounded-full"></div>
            <span>Cancel anytime</span>
          </div>
        </div>
      </div>
    </section>
  );
}
