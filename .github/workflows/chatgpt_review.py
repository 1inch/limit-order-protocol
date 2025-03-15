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
    "You are acting as an advanced code review assistant. Below is a diff from a Pull Request. "
    "Please analyze these changes in detail and provide a constructive critique. Focus on:\n"
    "- Potential bugs and security vulnerabilities\n"
    "- Conformance to coding style and best practices\n"
    "- Opportunities for performance or maintainability improvements\n"
    "\n"
    f"Diff:\n{diff_text}"
)

sys_prompt = (
    "You are a highly experienced senior software engineer and code reviewer with deep "
    "expertise across various programming languages and frameworks "
    "(including Solidity, JavaScript/TypeScript, and Rust). "
    "Your role is to thoroughly analyze code changes, focusing on correctness, security, "
    "maintainability, and adherence to best practices. Provide clear, actionable, and concise "
    "feedback with concrete suggestions for improvement where necessary. Avoid unnecessary elaboration, "
    "but ensure that critical details are clearly explained."
)

# 3. Вызов OpenAI ChatCompletion
model_name = "o1"  # можно сделать настраиваемым через переменные среды
completion = openai.chat.completions.create(
    model=model_name,
    messages=[
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": prompt}
    ],
    temperature=0.3,
    max_tokens=1000
)
review_text = completion.choices[0].message.content

# 4. Публикация комментария в PR через GitHub API
comment_url = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments"
requests.post(comment_url, headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"}, json={"body": review_text})
