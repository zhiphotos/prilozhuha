#!/bin/sh
# Проверка, открывается ли сайт из разных стран (бесплатные узлы check-host.net, около 30 стран). Запуск где угодно: sh deploy/ru/check-world.sh [адрес]
# Печатает, сколько узлов открыли сайт и из каких стран он не открылся. Можно запускать несколько раз подряд: узлы меняются.
URL="${1:-https://kniga-balanuca.ru/}"
R=$(curl -s -m 25 -H "Accept: application/json" "https://check-host.net/check-http?host=$URL&max_nodes=30") || { echo "check-host не ответил"; exit 1; }
ID=$(printf '%s' "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['request_id'])") || { echo "не удалось запустить проверку"; exit 1; }
sleep 15
curl -s -m 25 -H "Accept: application/json" "https://check-host.net/check-result/$ID" | python3 -c "
import sys, json
d = json.load(sys.stdin)
ok = 0; bad = []
for node, res in d.items():
    name = node.replace('.node.check-host.net', '')
    if res and res[0] and res[0][0] == 1 and str(res[0][3]).startswith('2'):
        ok += 1
    else:
        bad.append(name)
print(f'Открылось из {ok} узлов из {ok + len(bad)}. Не открылось: ' + (', '.join(sorted(bad)) or 'нигде'))
"
