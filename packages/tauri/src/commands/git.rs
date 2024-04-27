use git2::{Error, Repository};
use tauri::InvokeError;

pub struct GitErrorWrapper(Error);

impl std::convert::From<GitErrorWrapper> for InvokeError {
    fn from(val: GitErrorWrapper) -> Self {
        tauri::InvokeError::from(format!("{}", val.0))
    }
}

#[tauri::command]
/// Initialize a git repository in the specified directory with the specified files.
pub fn git_init_repository(repo_path: &str, file_paths: Vec<&str>) -> Result<(), GitErrorWrapper> {
    let repo = Repository::init(repo_path).map_err(GitErrorWrapper)?;
    create_initial_commit(&repo, file_paths).map_err(GitErrorWrapper)?;
    Ok(())
}

fn create_initial_commit(repo: &Repository, file_paths: Vec<&str>) -> Result<(), Error> {
    // First use the config to initialize a commit signature for the user.
    // FIXME: When user has not configured their git, use default values.
    let sig = repo.signature()?;

    // Now let's create a tree for this commit.
    let tree_id = {
        let mut index = repo.index()?;

        // Call index.add_path() for each file that should be in the commit.
        for file_path in file_paths {
            index.add_path(std::path::Path::new(file_path))?;
        }

        index.write_tree()?
    };

    let tree = repo.find_tree(tree_id)?;

    // Ready to create the initial commit.
    //
    // Normally creating a commit would involve looking up the current HEAD
    // commit and making that be the parent of the initial commit, but here this
    // is the first commit so there will be no parent.
    repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])?;

    Ok(())
}
