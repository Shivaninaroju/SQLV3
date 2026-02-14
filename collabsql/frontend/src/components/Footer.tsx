import { Twitter, Github, Linkedin, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="relative bg-black-light border-t border-black-border py-16 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1">
            <h3 className="font-heading font-bold text-2xl text-orange mb-4">AI SaaS</h3>
            <p className="text-text-muted text-sm font-body leading-relaxed">
              Building the future of artificial intelligence, one innovation at a time.
            </p>
          </div>

          <div>
            <h4 className="font-heading font-semibold text-text-primary mb-4">Product</h4>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-text-secondary hover:text-orange transition-colors duration-300 font-body text-sm">
                  Features
                </a>
              </li>
              <li>
                <a href="#" className="text-text-secondary hover:text-orange transition-colors duration-300 font-body text-sm">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#" className="text-text-secondary hover:text-orange transition-colors duration-300 font-body text-sm">
                  Documentation
                </a>
              </li>
              <li>
                <a href="#" className="text-text-secondary hover:text-orange transition-colors duration-300 font-body text-sm">
                  API Reference
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-heading font-semibold text-text-primary mb-4">Company</h4>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-text-secondary hover:text-orange transition-colors duration-300 font-body text-sm">
                  About Us
                </a>
              </li>
              <li>
                <a href="#" className="text-text-secondary hover:text-orange transition-colors duration-300 font-body text-sm">
                  Careers
                </a>
              </li>
              <li>
                <a href="#" className="text-text-secondary hover:text-orange transition-colors duration-300 font-body text-sm">
                  Blog
                </a>
              </li>
              <li>
                <a href="#" className="text-text-secondary hover:text-orange transition-colors duration-300 font-body text-sm">
                  Contact
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-heading font-semibold text-text-primary mb-4">Legal</h4>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-text-secondary hover:text-orange transition-colors duration-300 font-body text-sm">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="text-text-secondary hover:text-orange transition-colors duration-300 font-body text-sm">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#" className="text-text-secondary hover:text-orange transition-colors duration-300 font-body text-sm">
                  Cookie Policy
                </a>
              </li>
              <li>
                <a href="#" className="text-text-secondary hover:text-orange transition-colors duration-300 font-body text-sm">
                  Security
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-black-border flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-text-muted text-sm font-body">
            &copy; 2024 AI SaaS. All rights reserved.
          </p>
          <div className="flex gap-4">
            <a
              href="#"
              className="w-10 h-10 rounded-full bg-black-card border border-black-border flex items-center justify-center text-text-secondary hover:text-orange hover:border-orange transition-all duration-300 hover:scale-110"
            >
              <Twitter className="w-4 h-4" />
            </a>
            <a
              href="#"
              className="w-10 h-10 rounded-full bg-black-card border border-black-border flex items-center justify-center text-text-secondary hover:text-orange hover:border-orange transition-all duration-300 hover:scale-110"
            >
              <Github className="w-4 h-4" />
            </a>
            <a
              href="#"
              className="w-10 h-10 rounded-full bg-black-card border border-black-border flex items-center justify-center text-text-secondary hover:text-orange hover:border-orange transition-all duration-300 hover:scale-110"
            >
              <Linkedin className="w-4 h-4" />
            </a>
            <a
              href="#"
              className="w-10 h-10 rounded-full bg-black-card border border-black-border flex items-center justify-center text-text-secondary hover:text-orange hover:border-orange transition-all duration-300 hover:scale-110"
            >
              <Mail className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
