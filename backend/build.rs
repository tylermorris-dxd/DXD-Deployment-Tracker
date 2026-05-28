// Force Cargo to re-evaluate the build whenever any migration file
// changes. sqlx::migrate!() embeds the contents of migrations/*.sql
// into the binary at compile time, but rust-cache and incremental
// compilation will happily reuse stale build artifacts unless we
// tell Cargo explicitly which files affect the build output.

fn main() {
    println!("cargo:rerun-if-changed=migrations");
    // Walk the directory so additions / deletions also trigger a rebuild,
    // not just edits to existing files.
    if let Ok(entries) = std::fs::read_dir("migrations") {
        for entry in entries.flatten() {
            if let Some(path) = entry.path().to_str() {
                println!("cargo:rerun-if-changed={path}");
            }
        }
    }
}
