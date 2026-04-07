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
        }
      ]
    } else if (path === '/settings') {
      steps = [
         {
          popover: {
            title: 'Configurações Globais',
            description: 'Ajuste os parâmetros dos super poderes do seu GestãoFérias.'
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
