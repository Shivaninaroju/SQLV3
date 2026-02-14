import { Check } from 'lucide-react';

const plans = [
  {
    name: 'Starter',
    price: '29',
    description: 'Perfect for small projects and experimentation',
    features: [
      '10,000 API calls/month',
      'Basic AI models',
      'Email support',
      '99.9% uptime SLA',
      'Community access',
    ],
    popular: false,
  },
  {
    name: 'Professional',
    price: '99',
    description: 'For growing businesses and production applications',
    features: [
      '100,000 API calls/month',
      'All AI models',
      'Priority support',
      '99.99% uptime SLA',
      'Advanced analytics',
      'Custom integrations',
    ],
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'Tailored solutions for large-scale operations',
    features: [
      'Unlimited API calls',
      'Custom AI models',
      'Dedicated support team',
      '99.999% uptime SLA',
      'On-premise deployment',
      'Custom contracts',
    ],
    popular: false,
  },
];

export default function Pricing() {
  return (
    <section className="relative py-32 px-6 bg-black">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="font-heading font-bold text-5xl md:text-6xl mb-6">
            Simple, <span className="text-orange">Transparent</span> Pricing
          </h2>
          <p className="text-text-secondary text-lg md:text-xl max-w-2xl mx-auto font-body">
            Choose the perfect plan for your needs. Scale up or down anytime.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative bg-black-card border rounded-2xl p-8 transition-all duration-300 hover:scale-105 ${
                plan.popular
                  ? 'border-orange shadow-[0_0_40px_rgba(255,106,0,0.2)]'
                  : 'border-black-border hover:border-orange/50'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-orange rounded-full text-black text-sm font-semibold font-body">
                  Most Popular
                </div>
              )}

              <div className="mb-8">
                <h3 className="font-heading font-semibold text-2xl text-text-primary mb-2">
                  {plan.name}
                </h3>
                <p className="text-text-muted text-sm font-body mb-6">{plan.description}</p>
                <div className="flex items-baseline gap-2">
                  {plan.price !== 'Custom' ? (
                    <>
                      <span className="text-5xl font-bold text-orange font-heading">${plan.price}</span>
                      <span className="text-text-muted font-body">/month</span>
                    </>
                  ) : (
                    <span className="text-5xl font-bold text-orange font-heading">{plan.price}</span>
                  )}
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-orange/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-orange" />
                    </div>
                    <span className="text-text-secondary font-body">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                className={`w-full py-3 rounded-xl font-semibold font-body transition-all duration-300 ${
                  plan.popular
                    ? 'bg-orange text-black hover:bg-orange-hover hover:shadow-[0_0_30px_rgba(255,106,0,0.3)]'
                    : 'bg-transparent border-2 border-orange text-text-primary hover:bg-orange/10'
                }`}
              >
                Get Started
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
