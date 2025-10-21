#!/bin/bash
echo "正在检查余额..."
curl -s "https://yellowstone-rpc.litprotocol.com" -X POST -H "Content-Type: application/json" --data '{
  "jsonrpc":"2.0",
  "method":"eth_getBalance",
  "params":["0x3aEE355B3aCDAb4e738981Ff16577917FA49b19C", "latest"],
  "id":1
}' | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'result' in data:
    balance = int(data['result'], 16)
    eth_balance = balance / 10**18
    print(f'\n✅ 余额: {eth_balance:.6f} ETH')
    if balance > 0:
        print('�� 有余额！可以继续执行 npm run pkp')
    else:
        print('⏳ 还没有余额，请等待水龙头交易确认')
else:
    print('❌ 查询失败')
"
