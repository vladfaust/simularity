pub struct GitError(git2::Error);

impl std::convert::From<GitError> for tauri::InvokeError {
    fn from(val: GitError) -> Self {
        tauri::InvokeError::from(format!("{}", val.0))
    }
}

#[tauri::command]
/// Initialize a git repository.
pub fn git_init(repo_path: &str) -> Result<(), GitError> {
    git2::Repository::init(repo_path).map_err(GitError)?;
    Ok(())
}

#[tauri::command]
/// Get the HEAD commit hash of a git repository.
pub fn git_head(repo_path: &str) -> Result<String, GitError> {
    let repo = git2::Repository::open(repo_path).map_err(GitError)?;
    let head = repo.head().map_err(GitError)?;
    Ok(head.target().unwrap().to_string())
}

#[tauri::command]
/// Add files to the git index.
pub fn git_add(repo_path: &str, file_paths: Vec<&str>) -> Result<(), GitError> {
    let repo = git2::Repository::open(repo_path).map_err(GitError)?;
    let mut index = repo.index().map_err(GitError)?;
    for file_path in file_paths {
        index
            .add_path(std::path::Path::new(file_path))
            .map_err(GitError)?;
    }
    index.write().map_err(GitError)?;
    Ok(())
}

#[tauri::command]
/// Commit changes to a git repository.
/// Returns the commit hash.
pub fn git_commit(
    repo_path: &str,
    parent_commit_hash: Option<&str>,
    commit_message: &str,
) -> Result<String, GitError> {
    git_commit_impl(repo_path, parent_commit_hash, commit_message).map_err(GitError)
}
fn git_commit_impl(
    repo_path: &str,
    parent_commit_hash: Option<&str>,
    commit_message: &str,
) -> Result<String, git2::Error> {
    let repo = git2::Repository::open(repo_path)?;
    let sig = repo.signature()?;

    let mut index = repo.index()?;
    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;

    let oid = match parent_commit_hash {
        Some(oid) => {
            let parent = repo.find_commit(git2::Oid::from_str(oid)?)?;
            repo.commit(Some("HEAD"), &sig, &sig, commit_message, &tree, &[&parent])?
        }
        None => repo.commit(Some("HEAD"), &sig, &sig, commit_message, &tree, &[])?,
    };

    Ok(oid.to_string())
}
