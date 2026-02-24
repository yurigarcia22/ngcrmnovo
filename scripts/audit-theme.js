const fs = require('fs');
const path = require('path');

const FORBIDDEN_PATTERNS = [
    'dark:',
    'text-white',
    'bg-black',
    'bg-zinc-900',
    'bg-[#0b141a]',
    'bg-[#153046]',
    'text-slate-50'
];

// Exemptions (files where text-white might be valid, like buttons in UI components)
// CAUTION: Use sparingly.
const EXEMPTIONS = [
    'frontend/components/ui/simple-ui.tsx', // Likely contains primary buttons
    'frontend/app/globals.css', // Variables
];

function scanDirectory(dir) {
    const files = fs.readdirSync(dir);
    let errors = 0;

    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== '.next') {
                errors += scanDirectory(fullPath);
            }
        } else if (/\.(tsx|ts|js|jsx)$/.test(file)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const relativePath = fullPath.replace(process.cwd() + '\\', '').replace(/\\/g, '/');

            if (EXEMPTIONS.some(ex => relativePath.includes(ex))) return;

            FORBIDDEN_PATTERNS.forEach(pattern => {
                if (content.includes(pattern)) {
                    // Check context (simple check)
                    // Allow text-white if inside specific button classes? Hard to regex.
                    // For now, strict check.

                    // Exception for primary buttons explicitly: "bg-blue-600 text-white" 
                    // We can't easily regex that without a parser. 
                    // So we will just warn.

                    // console.error(`[THEME VIOLATION] Found '${pattern}' in ${relativePath}`);
                    // errors++;

                    // Actually, let's look for isolated usage. 
                    // If we find 'text-white', we flag it.
                    // But we know 'bg-blue-600 text-white' is allowed. 
                    // Let's just output them for manual review for now.
                    console.log(`[WARNING] Found '${pattern}' in ${relativePath}`);
                    errors++;
                }
            });
        }
    });

    return errors;
}

console.log("Starting Theme Audit...");
const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
console.log(`Scanning directory: ${targetDir}`);

const totalErrors = scanDirectory(targetDir);
console.log(`Audit complete. Found ${totalErrors} potential violations.`);
if (totalErrors > 0) {
    console.log("Please review warnings above. Some might be false positives (like primary buttons).");
    process.exit(1);
} else {
    console.log("No violations found!");
}
