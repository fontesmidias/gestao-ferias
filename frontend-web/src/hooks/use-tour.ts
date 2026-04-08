'use client'

import { useEffect } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { usePathname } from 'next/navigation'

export function useTour() {
  const pathname = usePathname()

  useEffect(() => {
    // A small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      runTourForPath(pathname)
    }, 1000)
    
    return () => clearTimeout(timer)
  }, [pathname])

  const runTourForPath = (path: string) => {
    // Only run if not seen before
    const cacheKey = `tour_seen_${path}`
    if (localStorage.getItem(cacheKey) === 'true') {
      return
    }

    let steps: any[] = []

    if (path === '/dashboard') {
      steps = [
        {
          element: 'aside',
          popover: {
            title: 'Navegação Estratégica',
            description: 'A partir daqui você acessa todas as vertentes do sistema. O menu pode ser recolhido para focar na tela principal.',
            side: 'right',
            align: 'start'
          }
        },
        {
          element: 'main h2',
          popover: {
            title: 'Seu Painel de Controle',
            description: 'Bem-vindo(a)! Este é o centro de inteligência do seu RH.',
            side: 'bottom',
            align: 'start'
          }
        },
        {
          element: '.recharts-responsive-container',
          popover: {
            title: 'Análise Preditiva Diária',
            description: 'Aqui, alimentado pelos dados do sistema, nós plotamos cenários de ocupação futura para você saber exatamente quando sua matriz ficará mais escassa.',
            side: 'top',
            align: 'center'
          }
        },
        {
          element: 'button[title="Opções da Conta"]',
          popover: {
            title: 'Seu Perfil e Acesso',
            description: 'Clique aqui a qualquer momento para abrir as configurações globais ou sair da aplicação de forma segura.',
            side: 'right',
            align: 'start'
          }
        }
      ]
    } else if (path === '/approvals') {
      steps = [
        {
          popover: {
            title: 'Caixa de Aprovações',
            description: 'Aqui estão todas as solicitações de colaboradores que exigem a sua validação.'
          }
        },
        {
          element: 'table',
          popover: {
            title: 'Controle Unitário ou em Massa',
            description: 'Você pode selecionar várias solicitações de uma vez ou aprová-las individualmente.',
            side: 'top',
            align: 'center'
          }
        },
        {
          element: '.fixed.bottom-8', // Targeting the floating action bar
          popover: {
            title: 'Ações em Lote',
            description: 'Sempre que selecionar registros na tabela, o painel despachante flutuante aparecerá aqui para você decidir tudo com 1 clique.',
            side: 'top',
            align: 'center'
          }
        }
      ]
    } else if (path === '/employees') {
      steps = [
        {
          element: 'main',
          popover: {
            title: 'Painel Central do Colaborador',
            description: 'Visão consolidada para gerenciar os dados dos seus colaboradores com eficiência e precisão estrutural.',
            side: 'top',
            align: 'start'
          }
        },
        {
          element: 'select.bg-slate-950', // targets the branch/workplace filters 
          popover: {
            title: 'Análise Dimensional',
            description: 'Utilize estas caixas de seleção para filtrar e buscar colaboradores por Empresa (razão social matriz) e Lotação (posto específico em que o profissional trabalha).',
            side: 'bottom',
            align: 'center'
          }
        },
        {
          element: 'button[title="Exportar Filtrados para CSV"]',
          popover: {
            title: 'Exportação Estratégica',
            description: 'Exporte os dados da visualização atual diretamente para uma planilha eletrônica, mantendo eventuais filtros selecionados.',
            side: 'bottom',
            align: 'start'
          }
        }
      ]
    } else if (path === '/settings') {
      steps = [
         {
          element: 'main',
          popover: {
            title: 'Configurações Globais',
            description: 'Ajuste os parâmetros dos super poderes do seu GestãoFérias.'
          }
        },
        {
          element: '#openaiKey',
          popover: {
            title: 'Ignição da Inteligência Artificial',
            description: 'Se quiser brincar com GPT ou Claude nas predições de faturamento ou análise de perfis, cole as suas chaves mestre da OpenAI/Anthropic aqui.',
            side: 'bottom',
            align: 'start'
          }
        },
        {
          element: '#smtpHost',
          popover: {
            title: 'Automações de Notificação',
            description: 'Assim que a sua transportadora/logística pedir aprovação, você assina, e essas portas SMTP garantem que eles receberão um e-mail com a boa notícia na mesma hora!',
            side: 'top',
            align: 'start'
          }
        }
      ]
    } else if (path === '/predict') {
       steps = [
         {
          popover: {
            title: 'Oráculo AI',
            description: 'Bem-vindo ao centro do pensamento estratégico preditivo! Converse com seus Dossiês usando IA.'
          }
         },
         {
           element: 'textarea',
           popover: {
             title: 'A Faça a pergunta Absurda',
             description: 'Pergunte coisas como: "Baseado no meu quadro, quem tem mais chance de burnout este ano?"',
             side: 'top',
             align: 'center'
           }
         }
       ]
    }

    if (steps.length > 0) {
      const driverObj = driver({
        showProgress: true,
        animate: true,
        nextBtnText: 'Próximo',
        prevBtnText: 'Voltar',
        doneBtnText: 'Concluir',
        popoverClass: 'driver-theme-dark',
        onDestroyStarted: () => {
          localStorage.setItem(cacheKey, 'true')
          driverObj.destroy()
        }
      })
      driverObj.setSteps(steps)
      driverObj.drive()
    }
  }

  return { runTourForPath }
}
