import NavBar from "@/components/NavBar";
import {
  ArrowRight,
  Sparkles,
  FileText,
} from "lucide-react";
import Link from "next/link";

const socialLinks = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/webresume.tech",
  },
  {
    label: "X",
    href: "https://x.com/webresumetech",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/webresume.tech",
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-col min-h-screen overflow-x-hidden">
      <NavBar />

      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden flex-1 flex items-center">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary-500/20 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-cyan-500/20 blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary-500/20 bg-primary-500/5 backdrop-blur-md mb-8">
            <Sparkles className="w-4 h-4 text-primary-500" />
            <span className="text-sm font-medium text-primary-500">2026 Updated Build: Pro + Premium Intelligence Stack</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold font-heading tracking-tight mb-6 leading-tight max-w-4xl mx-auto">
            AI Resume Analyzer for ATS Score<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-500 to-cyan-400">and Offer-Ready Strategy</span>
          </h1>

          <p className="text-lg md:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            This AI resume analyzer improves ATS score, fixes resume keywords, and helps you build an offer-ready
            strategy with recruiter screening insights, interview guidance, and salary negotiation support.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/upload" className="w-full sm:w-auto px-8 py-4 rounded-full bg-primary-500 hover:bg-primary-600 text-white font-medium flex items-center justify-center gap-2 transition-all hover:scale-105 shadow-lg shadow-primary-500/25">
              Start AI Resume Lab <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/overview" className="w-full sm:w-auto px-8 py-4 rounded-full glass hover:bg-white/5 border border-border text-foreground font-medium transition-all">
              Explore Pro + Premium Stack
            </Link>
          </div>

          <div className="mt-10 grid sm:grid-cols-3 gap-3 max-w-4xl mx-auto">
            {[
              { label: "Pro Intelligence", value: "ATS + Eye Path + Variants" },
              { label: "Premium Intelligence", value: "Reachability + ROI + Offer Strategy" },
              { label: "Recruiter Workflow", value: "HR Batch Ranking + Outreach Pack" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border/70 bg-card/50 px-4 py-3 text-left">
                <p className="text-[11px] uppercase tracking-wider text-primary-500 font-semibold">{item.label}</p>
                <p className="text-sm text-foreground mt-1">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-24 bg-[var(--background)] border-y border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-sm font-bold tracking-widest text-primary-500 uppercase mb-3">Feature Stack</h2>
            <h3 className="text-3xl md:text-4xl font-heading font-bold">Built for interviews, offers, and recruiter speed.</h3>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Company-Specific ATS Simulator",
                desc: "Greenhouse, Lever, and Workday style compatibility with direct fixes.",
                badge: "Pro",
              },
              {
                title: "Recruiter 7-Second Eye Path",
                desc: "Fold-by-fold attention map showing what recruiters scan first.",
                badge: "Pro",
              },
              {
                title: "Job-Tailored Resume Variants",
                desc: "Generate focused resume angles for different role targets and application tracks.",
                badge: "Pro",
              },
              {
                title: "Interview Conversion Predictor",
                desc: "Get realistic interview-call probability with drivers, risks, and actions.",
                badge: "Premium",
              },
              {
                title: "Offer Negotiation Copilot",
                desc: "Predicted salary, ask bands, rebuttal scripts, and close-ready lines.",
                badge: "Premium",
              },
              {
                title: "Application + Career Pack",
                desc: "Application pack, career narrative graph, reachability score, and skill ROI planner.",
                badge: "Premium",
              },
              {
                title: "Job Reachability Verdict",
                desc: "Apply now, Upskill first, or Stretch verdict for your target role.",
                badge: "Premium",
              },
              {
                title: "Skill ROI Planner",
                desc: "See which skill gives max shortlist uplift and salary upside.",
                badge: "Premium",
              },
              {
                title: "Recruiter HR Batch Suite",
                desc: "Batch ranking, red-flag scan, ATS matrix, and outreach-ready shortlist exports.",
                badge: "Pro/Premium",
              },
            ].map((f, i) => (
              <div key={i} className="glass-card p-8 group hover:-translate-y-1 transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-primary-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform text-primary-500 text-xl font-bold">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h4 className="text-xl font-heading font-bold mb-3 flex items-center gap-2">
                  {f.title}
                  {f.badge && <span className="text-[10px] uppercase tracking-wider bg-primary-500/20 text-primary-500 px-2 py-1 rounded-full">{f.badge}</span>}
                </h4>
                <p className="text-muted leading-relaxed text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-border bg-card/20">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-heading font-bold mb-4">AI Resume Optimization That Improves ATS and Recruiter Match Quality</h2>
          <p className="text-muted leading-relaxed">
            This platform combines AI resume analysis, ATS keyword optimization, recruiter shortlisting signals, and
            role-specific resume rewrite guidance. Candidates use it to increase profile relevance, improve ATS parsing
            outcomes, and convert more applications into interview calls.
          </p>
        </div>
      </section>

      <section className="py-16 border-b border-border bg-background">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-heading font-bold mb-8 text-center">Resume SEO and ATS Optimization FAQs</h2>
          <div className="space-y-4">
            <article className="glass-card p-6">
              <h3 className="text-lg font-heading font-semibold mb-2">How does this ATS score checker improve resume ranking?</h3>
              <p className="text-muted text-sm leading-relaxed">
                The analyzer highlights missing role keywords, weak section structure, and recruiter readability gaps so
                you can rewrite high-impact lines and improve parsing confidence across common ATS systems.
              </p>
            </article>
            <article className="glass-card p-6">
              <h3 className="text-lg font-heading font-semibold mb-2">Can I tailor one resume for multiple job descriptions?</h3>
              <p className="text-muted text-sm leading-relaxed">
                Yes. WebResume.tech generates job-specific resume variants so candidates can target product, engineering,
                operations, and analytics roles with stronger keyword alignment and clearer value statements.
              </p>
            </article>
            <article className="glass-card p-6">
              <h3 className="text-lg font-heading font-semibold mb-2">Is this useful after I already have interview calls?</h3>
              <p className="text-muted text-sm leading-relaxed">
                Absolutely. Beyond ATS and resume analysis, the platform includes interview conversion guidance,
                application messaging support, and negotiation scripts to improve end-to-end job search outcomes.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-24 bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h2 className="text-sm font-bold tracking-widest text-primary-500 uppercase mb-3">The Process</h2>
          <h3 className="text-3xl md:text-4xl font-heading font-bold mb-16">3 steps to a market-ready profile.</h3>

          <div className="relative">
            <div className="hidden md:block absolute top-[40px] left-[15%] right-[15%] h-0.5 bg-gradient-to-r from-primary-500/0 via-primary-500/30 to-primary-500/0 z-0" />
            <div className="grid md:grid-cols-3 gap-12 relative z-10">
              {[
                {
                  step: "1",
                  title: "Upload + Role Target",
                  desc: "Upload resume, paste job description, and activate pro/premium signals in one run.",
                },
                {
                  step: "2",
                  title: "AI Intelligence Pass",
                  desc: "Get ATS simulation, recruiter eye-path, targeted variants, and conversion-risk breakdown.",
                },
                {
                  step: "3",
                  title: "Apply + Negotiate",
                  desc: "Use application drafts, reachability verdict, ROI planner, and offer scripts to move faster.",
                },
              ].map((s, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full bg-primary-500 text-white font-heading text-3xl font-bold flex items-center justify-center mb-6 shadow-xl shadow-primary-500/20 border-8 border-card">
                    {s.step}
                  </div>
                  <h4 className="text-xl font-heading font-bold mb-3">{s.title}</h4>
                  <p className="text-muted leading-relaxed text-sm">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-16">
            <Link href="/upload" className="inline-block px-8 py-4 rounded-full bg-primary-500 hover:bg-primary-600 text-white font-medium transition-all shadow-lg shadow-primary-500/25">
              Launch Resume Lab &rarr;
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-12 border-t border-border text-center text-muted text-sm glass">
        <div className="flex items-center justify-center gap-2 mb-4 font-heading text-xl text-foreground font-bold">
          <FileText className="w-5 h-5 text-primary-500" /> WebResume<span className="text-primary-500">.tech</span>
        </div>
        <div className="flex items-center justify-center gap-4 mb-3">
          {socialLinks.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm hover:text-foreground transition-colors"
            >
              {social.label}
            </a>
          ))}
        </div>
        <p>© 2026 WebResume.tech. From resume quality to offer confidence.</p>
      </footer>
    </main>
  );
}