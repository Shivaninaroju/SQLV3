import { Brain, Zap, Shield, Code, History, Users } from 'lucide-react';

const features = [
  {
    icon: Brain,
    title: 'Natural Language to SQL',
    description: 'Ask questions in plain English and get accurate SQL queries generated instantly.',
  },
  {
    icon: Zap,
    title: 'Schema-Aware Intelligence',
    description: 'AI understands your database structure and generates contextually relevant queries.',
  },
  {
    icon: Code,
    title: 'Real-Time Query Execution',
    description: 'Execute queries safely with instant results and structured data visualization.',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description: 'Invite team members, share projects, and collaborate on database analysis together.',
  },
  {
    icon: History,
    title: 'Query History & Analytics',
    description: 'Track all queries, view execution time, and analyze database usage patterns.',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Bank-level encryption and full compliance with data protection standards.',
  },
];

export default function Features() {
  return (
    <section className="relative py-32 px-6 bg-black-light">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="font-heading font-bold text-5xl md:text-6xl mb-6">
            Built for <span className="text-orange">Developers</span>
          </h2>
          <p className="text-text-secondary text-lg md:text-xl max-w-2xl mx-auto font-body">
            Everything you need to work with databases smarter and faster
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group bg-black-card border border-black-border rounded-2xl p-8 transition-all duration-300 hover:border-orange/50 hover:shadow-[0_0_30px_rgba(255,106,0,0.1)] hover:scale-105"
            >
              <div className="w-14 h-14 bg-orange/10 rounded-xl flex items-center justify-center mb-6 transition-all duration-300 group-hover:bg-orange/20 group-hover:scale-110">
                <feature.icon className="w-7 h-7 text-orange" />
              </div>
              <h3 className="font-heading font-semibold text-2xl text-text-primary mb-4">
                {feature.title}
              </h3>
              <p className="text-text-secondary leading-relaxed font-body">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
