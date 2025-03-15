import os, requests, openai

# Получаем переменные среды
repo = os.environ.get("GITHUB_REPOSITORY")
pr_number = os.environ.get("GITHUB_REF", "").split("/")[-2]  # извлекаем номер PR из ссылки вида "refs/pull/123/merge"
openai.api_key = os.environ["OPENAI_API_KEY"]

# 1. Получение diff через GitHub API
pr_url = f"https://api.github.com/repos/{repo}/pulls/{pr_number}"
headers = {
    "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
    "Accept": "application/vnd.github.v3.diff"
}
diff_response = requests.get(pr_url, headers=headers)
diff_text = diff_response.text

# 2. Формирование промпта для ChatGPT
prompt = (
    "Вы выступаете в роли ассистента по ревью кода. Вам предоставлен дифф коммитов в Pull Request. "
    "Проанализируйте изменения и предоставьте отзывы: найдите потенциальные ошибки, проблемы безопасности, "
    "несоответствия стилю или лучшие практики, а также дайте рекомендации по улучшению кода.\n\n"
    f"Дифф:\n{diff_text}"
)

# 3. Вызов OpenAI ChatCompletion
model_name = "gpt-3.5-turbo"  # можно сделать настраиваемым через переменные среды
completion = openai.chat.completions.create(
    model=model_name,
    messages=[
        {"role": "system", "content": "You are a senior software engineer and code reviewer."},
        {"role": "user", "content": prompt}
    ],
    temperature=0.3,
    max_tokens=1000
)
review_text = completion["choices"][0]["message"]["content"]

# 4. Публикация комментария в PR через GitHub API
comment_url = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments"
requests.post(comment_url, headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"}, json={"body": review_text})
