import os, requests, openai

repo = os.environ.get("GITHUB_REPOSITORY")
pr_number = os.environ.get("GITHUB_REF", "").split("/")[-2]  # извлекаем номер PR из ссылки вида "refs/pull/123/merge"
openai.api_key = os.environ["OPENAI_API_KEY"]

pr_url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}"
headers = {
    "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
    "Accept": "application/vnd.github.v3.diff"
}
diff_response = requests.get(pr_url, headers=headers)
diff_text = diff_response.text

prompt = (
    "Do code review and analyze code changes "
    "Provide clear, actionable, and concise feedback with concrete suggestions for improvement where necessary. "
    "Avoid unnecessary elaboration, but ensure that critical details are clearly explained. "
    "Focus on:\n"
    "- Potential bugs and security vulnerabilities\n"
    "- Conformance to coding style and best practices\n"
    "- Opportunities for performance or maintainability improvements\n"
    "\n"
    f"Diff:\n{diff_text}"
)

model_name = "o3-mini"
completion = openai.chat.completions.create(
    model=model_name,
    reasoning_effort="medium",
    messages=[
        {"role": "user", "content": prompt}
    ],
    temperature=0.3,
    max_completion_tokens=1000
)
review_text = completion.choices[0].message.content

# 4. Публикация комментария в PR через GitHub API
comment_url = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments"
requests.post(comment_url, headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"}, json={"body": review_text})
