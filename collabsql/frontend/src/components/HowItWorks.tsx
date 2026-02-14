const steps = [
  {
    number: '1',
    title: 'Upload Database',
    description: 'Upload your SQL database file and let CollabSQL automatically analyze the complete schema structure.',
  },
  {
    number: '2',
    title: 'Query with AI',
    description: 'Ask questions in natural language. Our AI instantly converts them to precise SQL queries.',
  },
  {
    number: '3',
    title: 'Analyze Data',
    description: 'Get comprehensive analytics, visualize statistics, and export detailed reports as PDFs.',
  },
  {
    number: '4',
    title: 'Collaborate',
    description: 'Work together with your team in real-time. Share databases and manage collaborator access.',
  },
  {
    number: '5',
    title: 'Track Changes',
    description: 'Monitor all database operations with GitHub-style commit history and detailed operation logs.',
  },
  {
    number: '6',
    title: 'Download Updated DB',
    description: 'Download your modified database in multiple formats (.db, .sqlite, .sqlite3, .csv) with complete modification reports.',
  },
];

export default function HowItWorks() {
  return (
    <section className="relative py-32 px-6 bg-black">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="font-heading font-bold text-5xl md:text-6xl mb-6">
            How It <span className="text-orange">Works</span>
          </h2>
          <p className="text-text-secondary text-lg md:text-xl max-w-2xl mx-auto font-body">
            Complete database management workflow in six powerful steps
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {steps.map((step, index) => {
            return (
              <div
                key={index}
                className="relative group"
              >
                <div className="bg-black-card border border-black-border rounded-2xl p-8 h-full hover:border-orange/30 transition-all duration-300 hover:shadow-lg hover:shadow-orange/5">
                  <div className="mb-6">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-orange text-black font-heading font-bold text-xl">
                      {step.number}
                    </div>
                  </div>
                  <h3 className="font-heading font-semibold text-2xl text-text-primary mb-4">
                    {step.title}
                  </h3>
                  <p className="text-text-secondary leading-relaxed font-body">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Additional Info */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-2 bg-orange/10 border border-orange/30 rounded-full px-6 py-3">
            <div className="w-2 h-2 rounded-full bg-orange animate-pulse"></div>
            <p className="text-orange font-semibold text-sm">
              All features work seamlessly together for the ultimate database experience
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
