# Pulso — App de Treino

Aplicativo web de treino com metas diárias e pontuação. Funciona direto no navegador (celular ou computador), sem instalação e sem servidor. Os dados ficam salvos no próprio aparelho (`localStorage`).

## Como usar

Abra o `index.html` no navegador. Para usar no celular, publique a pasta no **GitHub Pages** (Settings → Pages → Branch `main`) e acesse o link; dá para "Adicionar à tela inicial".

## Áreas (cada uma em uma aba separada)

| Aba | O que faz |
| --- | --- |
| **Metas** | Pontuação do dia (0–100), progresso de cada meta, nível, pontos acumulados e gráfico dos últimos 7 dias |
| **Treinos** | Ficha de treinos (A, B, C…) com exercícios, séries, repetições e carga; registro do treino do dia; **sequência de dias sem falta**, recorde e calendário |
| **Calorias** | Meta diária calculada pelas suas medidas, registro de refeições (com lista de alimentos comuns), proteína e gasto nos treinos |
| **Água** | Quanto você bebeu hoje × quanto deve beber, botões rápidos (200/250/350/500 ml) e histórico da semana |
| **Medidas** | Perfil (sexo, idade, altura, peso, atividade, objetivo), IMC, medidas do corpo (cintura, quadril, peito, braço, coxa, % gordura) com histórico e gráfico de peso |

## Sistema de pontos

| Meta | Pontos | Regra |
| --- | --- | --- |
| Treino | 40 | Treinou hoje, ou hoje é dia de descanso |
| Água | 30 | Proporcional ao quanto bebeu da meta |
| Alimentação | 30 | Total se ficar entre 90% e 110% da meta de calorias; diminui quando passa ou fica abaixo disso |

A cada 500 pontos acumulados você sobe de nível.

## Cálculos

- **Calorias:** Mifflin-St Jeor × nível de atividade; −500 kcal para perder peso, +300 kcal para ganhar massa.
- **Água:** 35 ml por kg de peso, +500 ml em dias com treino.
- **Proteína:** 1,6 g/kg para manter o peso, 2 g/kg para perder ou ganhar.
- **Sequência:** dias seguidos com treino. Os dias desmarcados como dia de treino contam como descanso e não quebram a sequência.