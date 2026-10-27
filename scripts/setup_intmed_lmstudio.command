#!/bin/zsh
set -u
SCRIPT_DIR="${0:A:h}"
cd "${SCRIPT_DIR:h}" || exit 1
clear
python3 scripts/local_runner_macos.py bootstrap
result=$?
echo
if [[ $result -eq 0 ]]; then
  echo "راه‌اندازی با موفقیت تمام شد. این پنجره را ببندید."
else
  echo "راه‌اندازی کامل نشد. متن خطای بالا را برای پشتیبانی بفرستید."
fi
echo "برای بستن پنجره Enter را بزنید."
read
exit $result
