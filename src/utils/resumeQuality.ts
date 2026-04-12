export const CORE_RESUME_SECTIONS = [
  "Education",
  "Projects",
  "Achievements / Certifications",
  "Technical / Soft Skills",
] as const;

const CORE_SECTION_PATTERNS: Array<{ label: string; patterns: RegExp[] }> = [
  {
    label: "Education",
    patterns: [
      /\beducation\b/i,
      /\bacademic\b/i,
      /\b(university|college|institute|school)\b/i,
      /\b(b\.tech|btech|b\.e|be|m\.tech|mtech|degree)\b/i,
    ],
  },
  {
    label: "Projects",
    patterns: [
      /\bprojects?\b/i,
      /\bcase\s*stud(y|ies)\b/i,
      /\bportfolio\b/i,
      /\bwork\s*samples?\b/i,
    ],
  },
  {
    label: "Achievements / Certifications",
    patterns: [
      /\bachievements?\b/i,
      /\bcertifications?\b/i,
      /\bawards?\b/i,
      /\baccomplishments?\b/i,
      /\blicenses?\b/i,
    ],
  },
  {
    label: "Technical / Soft Skills",
    patterns: [
      /\bskills?\b/i,
      /\btechnical\s+skills?\b/i,
      /\bsoft\s+skills?\b/i,
      /\b(core\s+competencies|tooling|technologies)\b/i,
    ],
  },
];

export function detectMissingCoreSections(text: string): string[] {
  const compactText = text.replace(/\s+/g, " ").trim();

  return CORE_SECTION_PATTERNS.filter((section) =>
    !section.patterns.some((pattern) => pattern.test(compactText))
  ).map((section) => section.label);
}

export function getExampleResumeTextTemplate(): string {
  return [
    "NAME | City, State | Phone | Email | LinkedIn | GitHub",
    "",
    "SUMMARY",
    "Results-driven [role] with [X years] experience in [domain]. Built [impact result] using [tech stack].",
    "",
    "EDUCATION",
    "B.Tech in Computer Science, ABC University, 2022 - 2026",
    "CGPA: 8.5/10",
    "",
    "TECHNICAL SKILLS",
    "Languages: JavaScript, TypeScript, Python, SQL",
    "Frameworks: React, Next.js, Node.js",
    "Tools: Git, Docker, Postman",
    "Soft Skills: Communication, Teamwork, Problem Solving",
    "",
    "PROJECTS",
    "1) Resume Analyzer Platform",
    "- Built a full-stack app for ATS scoring and resume insights using Next.js and Supabase.",
    "- Improved user completion rate by 32% with guided rewrite suggestions.",
    "2) E-commerce Dashboard",
    "- Developed analytics dashboards and reduced report generation time by 40%.",
    "",
    "ACHIEVEMENTS / CERTIFICATIONS",
    "- Solved 400+ coding problems on LeetCode.",
    "- AWS Cloud Practitioner Certification.",
    "",
    "EXPERIENCE (Optional if fresher)",
    "Software Intern, XYZ Pvt Ltd, Jan 2025 - Jun 2025",
    "- Implemented API optimization, reducing latency by 25%.",
  ].join("\n");
}
