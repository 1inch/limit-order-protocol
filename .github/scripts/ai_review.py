import os
import requests
import openai
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('pr_review_bot')

# Define model arrays
REGULAR_MODELS = ["gpt-3.5-turbo", "gpt-4o"]
REASONING_MODELS = ["o1-mini"]

# Extract PR number from github environment
def get_pr_number(github_ref):
    parts = github_ref.split("/")
    if len(parts) >= 3 and parts[1] == "pull":
        pr_number = parts[2]
    else:
        raise ValueError(f"Unexpected GITHUB_REF format: {github_ref}")
    return pr_number

# Fetch PR code diff
def fetch_diff(pr_url, github_token):
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github.v3.diff"
    }
    diff_response = requests.get(pr_url, headers=headers)
    if diff_response.status_code != 200:
        raise RuntimeError(f"Failed to fetch PR diff: {diff_response.status_code} {diff_response.text}")
    return diff_response.text

# Fetch PR description
def fetch_pr_description(pr_url, github_token):
    json_headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github.v3+json"
    }
    pr_details_response = requests.get(pr_url, headers=json_headers)
    pr_data = pr_details_response.json()
    pr_title = pr_data.get("title", "(no title)")
    pr_body  = pr_data.get("body", "(no body)")
    return pr_title, pr_body

def generate_review_regular(diff_text, pr_title, pr_body, model_name):
    logger.info(f"Generating code review with regular model: {model_name}")
    prompt = (
        "You are acting as an advanced code review assistant. Below is a diff from a Pull Request. "
        "Please analyze these changes in detail and provide a constructive critique. Focus on:\n"
        "- Potential bugs and security vulnerabilities\n"
        "- Conformance to coding style and best practices\n"
        "- Opportunities for performance or maintainability improvements\n"
        "\n"
        f"Diff:\n{diff_text}"
    )

    dev_prompt = (
        "You are a highly experienced senior software engineer and code reviewer with deep "
        "expertise across various programming languages and frameworks "
        "(including Solidity, JavaScript/TypeScript, and Rust). "
        "Your role is to thoroughly analyze code changes, focusing on correctness, security, "
        "maintainability, and adherence to best practices. Provide clear, actionable, and concise "
        "feedback with concrete suggestions for improvement where necessary. Avoid unnecessary elaboration, "
        "but ensure that critical details are clearly explained."
    )

    try:
        completion = openai.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "developer", "content": dev_prompt},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_completion_tokens=1000
        )
    except Exception as e:
        logger.error(f"Failed to generate review: {e}")
        raise RuntimeError(f"Failed to generate review: {e}")
    
    return completion.choices[0].message.content

def generate_review_reasoning(diff_text, pr_title, pr_body, model_name):
    logger.info(f"Generating code review with reasoning model: {model_name}")
    prompt = (
        "Do code review and analyze code changes. "
        "Focus on:\n"
        "- Potential bugs and security vulnerabilities\n"
        "- Conformance to coding style and best practices\n"
        "- Opportunities for performance or maintainability improvements\n"
        "\n"
        "Give summary of what the code changes are doing. "
        "Then identify potential issues or improvements and provide specific, actionable suggestions "
        "how to fix the identified issues if there are any. Avoid giving general recommendations, not related to code fixes or improvements."
        "\n\n"
        f"PR Title:\n{pr_title}\n"
        f"PR Description:\n{pr_body}\n"
        f"Diff:\n{diff_text}"
    )
    
    try:
        completion = openai.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
    except Exception as e:
        logger.error(f"Failed to generate review: {e}")
        raise RuntimeError(f"Failed to generate review: {e}")
    
    return completion.choices[0].message.content

def generate_review(diff_text, pr_title, pr_body, model_name="o1-mini"):
    if model_name in REGULAR_MODELS:
        return generate_review_regular(diff_text, pr_title, pr_body, model_name)
    elif model_name in REASONING_MODELS:
        return generate_review_reasoning(diff_text, pr_title, pr_body, model_name)
    else:
        logger.warning(f"Unknown model type: {model_name}, trying regular review")
        return generate_review_regular(diff_text, pr_title, pr_body, model_name)

# Post review as a comment
def post_review_comment(repo, pr_number, review_text, github_token):
    logger.info(f"Posting review comment for PR #{pr_number}")
    comment_url = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments"
    comment_headers = {"Authorization": f"Bearer {github_token}"} 
    response = requests.post(comment_url, headers=comment_headers, json={"body": review_text})
    if response.status_code != 201:
        logger.error(f"Failed to post comment: {response.status_code} {response.text}")
        return False
    else:
        logger.info("Successfully posted review comment")
        return True

# Action start
logger.info("Starting PR review workflow")

# Get environment variables
repo = os.environ.get("GITHUB_REPOSITORY")
github_ref = os.environ.get("GITHUB_REF")
github_token = os.environ.get("GITHUB_TOKEN")
openai.api_key = os.environ["OPENAI_API_KEY"]
model_name = os.environ.get("OPENAI_MODEL", "o1-mini")

# Check if required environment variables exist
if not repo or not github_ref or not github_token:
    logger.critical("Missing required environment variables")
    raise ValueError("Missing required environment variables: GITHUB_REPOSITORY, GITHUB_REF, or GITHUB_TOKEN")

# Get PR ids
pr_number = get_pr_number(github_ref)
logger.info(f"Processing PR #{pr_number} with model {model_name}")
pr_url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}"

# Fetch PR details
logger.info("Fetching PR diff")
diff_text = fetch_diff(pr_url, github_token)
logger.info("Fetching PR description")
pr_title, pr_body = fetch_pr_description(pr_url, github_token)

# Generate review with AI
review_text = generate_review(diff_text, pr_title, pr_body, model_name)

# Post the review
post_review_comment(repo, pr_number, review_text, github_token)
logger.info("PR review workflow completed")
